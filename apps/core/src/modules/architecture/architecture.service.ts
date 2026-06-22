import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { applyPatch, diffModels, formatDiff, hashModel, PatchError, validateStructure } from '@cac/caml';
import type { CamlDocument, ModelDiff } from '@cac/caml';
import { validateAgainstCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { CATALOG } from '../catalog/api';
import { validateModel, knowledgeByService } from '../validation/api';
import type { ValidationReport } from '../validation/api';
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

  async listArchitectures(): Promise<
    Array<{ id: string; name: string; description: string | null; defaultBranch: string; lifecycle: string; createdAt: Date }>
  > {
    const rows = await this.repo.listArchitectures();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      defaultBranch: r.default_branch,
      lifecycle: r.lifecycle,
      createdAt: r.created_at,
    }));
  }

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
    if (hash === head) {
      // Model unchanged (e.g. a tidy-up / nudge): the commit is a no-op, but the
      // layout sidecar isn't content-addressed — persist it onto the head commit
      // so positions survive a reload.
      if (body.layout !== undefined) await this.repo.updateCommitLayout(architectureId, head, body.layout);
      return { hash, parents: [head], unchanged: true };
    }

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

  /**
   * Advisory validation of the branch head (doc 16 pack + the Phase-3B anti-pattern rule).
   * Reads the catalog `knowledge` metadata so ARC-001 can flag discouraged connections.
   */
  async validateBranch(architectureId: string, branch: string): Promise<{ commit: string } & ValidationReport> {
    const { model, hash } = await this.getModel(architectureId, branch);
    return { commit: hash, ...validateModel(model, knowledgeByService(this.catalog)) };
  }

  /** The layout sidecar (positions/sizes) stored on the branch head commit. */
  async getLayout(architectureId: string, branch: string): Promise<{ commit: string; layout: unknown }> {
    const head = await this.repo.getBranchHead(architectureId, branch);
    if (head === null) throw new NotFoundException('architecture or branch not found');
    const commit = await this.repo.getCommit(architectureId, head);
    if (!commit) throw new NotFoundException('head commit not found');
    return { commit: head, layout: commit.layout ?? null };
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

  async listCommits(
    architectureId: string,
    options: { limit?: number; cursor?: string },
  ): Promise<{ commits: CommitMeta[]; nextCursor: string | null }> {
    if (!(await this.repo.architectureExists(architectureId))) {
      throw new NotFoundException(`architecture ${architectureId} not found`);
    }
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const rows = await this.repo.listCommits(architectureId, limit + 1, decodeCursor(options.cursor));

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1]!;
      nextCursor = encodeCursor(last.created_at, last.hash);
      rows.length = limit;
    }
    return {
      commits: rows.map((r) => ({
        hash: r.hash,
        parents: r.parent_hashes,
        origin: r.origin,
        message: r.message,
        stats: r.stats,
        authorId: r.author_id,
        createdAt: r.created_at,
      })),
      nextCursor,
    };
  }

  /** Typed ModelDiff between two refs (commit hash or branch name). */
  async diff(
    architectureId: string,
    from: string,
    to: string,
  ): Promise<{ from: string; to: string; summary: string; diff: ModelDiff }> {
    if (!from || !to) throw new BadRequestException('both "from" and "to" are required');
    const fromHash = await this.resolveRef(architectureId, from);
    const toHash = await this.resolveRef(architectureId, to);
    const a = await this.repo.getCommit(architectureId, fromHash);
    if (!a) throw new NotFoundException(`commit ${fromHash} not found`);
    const b = await this.repo.getCommit(architectureId, toHash);
    if (!b) throw new NotFoundException(`commit ${toHash} not found`);
    const diff = diffModels(a.model, b.model);
    return { from: fromHash, to: toHash, summary: formatDiff(diff), diff };
  }

  /** A ref is a branch name (resolved to its head) or, failing that, a commit hash. */
  private async resolveRef(architectureId: string, ref: string): Promise<string> {
    const head = await this.repo.getBranchHead(architectureId, ref);
    return head ?? ref;
  }
}

export interface CommitMeta {
  hash: string;
  parents: string[];
  origin: string;
  message: string;
  stats: unknown;
  authorId: string | null;
  createdAt: Date;
}

function encodeCursor(createdAt: Date, hash: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${hash}`).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: Date; hash: string } | undefined {
  if (!cursor) return undefined;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = decoded.lastIndexOf('|');
  if (sep === -1) throw new BadRequestException('invalid cursor');
  return { createdAt: new Date(decoded.slice(0, sep)), hash: decoded.slice(sep + 1) };
}
