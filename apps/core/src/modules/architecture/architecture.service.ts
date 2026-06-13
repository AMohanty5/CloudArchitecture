import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { applyPatch, hashModel, PatchError, validateStructure } from '@cac/caml';
import type { CamlDocument } from '@cac/caml';
import { validateAgainstCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { CATALOG } from '../catalog/api';
import { ArchitectureRepository } from './architecture.repository';
import { computeStats } from './stats';
import type { CommitDto, CreateArchitectureDto } from './dto';

const byteLength = (model: CamlDocument): number => Buffer.byteLength(JSON.stringify(model));

/**
 * The sacred write path (blueprint doc 12 invariant 3): create + append-only,
 * content-addressed commits with optimistic concurrency. Never destructive.
 */
@Injectable()
export class ArchitectureService {
  constructor(
    private readonly repo: ArchitectureRepository,
    @Inject(CATALOG) private readonly catalog: Catalog,
  ) {}

  async create(input: CreateArchitectureDto): Promise<{ id: string; defaultBranch: string; head: string }> {
    const id = randomUUID();
    const camlId = `arch_${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const branch = 'main';
    const model: CamlDocument = { camlVersion: '1.0', id: camlId, name: input.name, components: [] };
    const hash = hashModel(model);

    await this.repo.withTransaction(async (client) => {
      await this.repo.insertArchitecture(client, {
        id,
        name: input.name,
        description: input.description,
        workspaceId: input.workspaceId,
        defaultBranch: branch,
        catalogVersion: input.catalogVersion ?? 'dev',
      });
      await this.repo.insertCommit(client, {
        hash,
        architectureId: id,
        parentHashes: [],
        origin: 'manual',
        message: 'Initial commit',
        model,
        modelSizeBytes: byteLength(model),
        stats: computeStats(model),
        layout: null,
      });
      await this.repo.insertBranch(client, { architectureId: id, name: branch, headHash: hash });
    });

    return { id, defaultBranch: branch, head: hash };
  }

  async commit(
    architectureId: string,
    branch: string,
    body: CommitDto,
  ): Promise<{ hash: string; parents: string[]; unchanged?: boolean }> {
    const head = await this.repo.getBranchHead(architectureId, branch);
    if (head === null) {
      const exists = await this.repo.architectureExists(architectureId);
      throw new NotFoundException(exists ? `branch "${branch}" not found` : `architecture ${architectureId} not found`);
    }
    if (body.expectedParent !== head) {
      throw new ConflictException({
        title: 'Parent moved',
        detail: `branch head is ${head}; rebase your change onto it`,
        expectedParent: body.expectedParent,
        actualHead: head,
      });
    }

    const model = await this.buildModel(architectureId, head, body);

    const structural = validateStructure(model);
    const errors = [...structural.errors];
    if (structural.valid) errors.push(...validateAgainstCatalog(model, this.catalog).errors);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        title: 'Validation failed',
        detail: `${errors.length} validation error(s)`,
        errors,
      });
    }

    const hash = hashModel(model);
    if (hash === head) return { hash, parents: [head], unchanged: true };

    const moved = await this.repo.withTransaction(async (client) => {
      await this.repo.insertCommit(client, {
        hash,
        architectureId,
        parentHashes: [head],
        origin: 'manual',
        message: body.message,
        model,
        modelSizeBytes: byteLength(model),
        stats: computeStats(model),
        layout: body.layout ?? null,
      });
      return this.repo.moveBranchHead(client, architectureId, branch, head, hash);
    });
    if (!moved) {
      throw new ConflictException({ title: 'Parent moved', detail: 'a concurrent commit moved the branch head' });
    }
    return { hash, parents: [head] };
  }

  private async buildModel(architectureId: string, head: string, body: CommitDto): Promise<CamlDocument> {
    if (body.model && body.patch) throw new BadRequestException('provide either model or patch, not both');
    if (body.model) return body.model;
    if (body.patch) {
      const parent = await this.repo.getCommit(architectureId, head);
      if (!parent) throw new NotFoundException(`parent commit ${head} not found`);
      try {
        return applyPatch<CamlDocument>(parent.model, body.patch);
      } catch (err) {
        if (err instanceof PatchError) {
          throw new UnprocessableEntityException({ title: 'Invalid patch', detail: err.message });
        }
        throw err;
      }
    }
    throw new BadRequestException('commit requires a model or a patch');
  }

  async getModel(architectureId: string, branch: string): Promise<{ model: CamlDocument; hash: string }> {
    const head = await this.repo.getBranchHead(architectureId, branch);
    if (head === null) throw new NotFoundException('architecture or branch not found');
    const commit = await this.repo.getCommit(architectureId, head);
    if (!commit) throw new NotFoundException('head commit not found');
    return { model: commit.model, hash: head };
  }

  async getCommit(architectureId: string, hash: string) {
    const commit = await this.repo.getCommit(architectureId, hash);
    if (!commit) throw new NotFoundException(`commit ${hash} not found`);
    return {
      hash: commit.hash,
      parents: commit.parent_hashes,
      origin: commit.origin,
      message: commit.message,
      stats: commit.stats,
      createdAt: commit.created_at,
      model: commit.model,
    };
  }
}
