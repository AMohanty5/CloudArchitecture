import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { diffModels, hashModel } from '@cac/caml';
import type { CamlDocument } from '@cac/caml';
import { loadCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { runMigrations } from '../../src/database/migrate';
import { DEFAULT_TENANT_ID } from '../../src/config/config';
import { ArchitectureRepository } from '../../src/modules/architecture/architecture.repository';
import { ArchitectureService } from '../../src/modules/architecture/architecture.service';
import { seedDatabase } from '../../src/modules/architecture/seed';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, '../../../../catalog');
const examplePath = path.resolve(here, '../../../../packages/catalog/fixtures/web-3tier.example.json');
const example = (): CamlDocument => JSON.parse(readFileSync(examplePath, 'utf8'));

let container: StartedPostgreSqlContainer;
let pool: Pool;
let service: ArchitectureService;
let catalog: Catalog;

const statusOf = (err: unknown): number => (err instanceof HttpException ? err.getStatus() : 0);

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({
    connectionString: container.getConnectionUri(),
    options: `-c app.tenant_id=${DEFAULT_TENANT_ID}`,
  });
  await runMigrations(pool);
  catalog = loadCatalog(catalogDir);
  service = new ArchitectureService(new ArchitectureRepository(pool), catalog);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('Architecture write path (integration)', () => {
  it('happy path: create → commit full model → read back by branch and by hash', async () => {
    const { id, head } = await service.create({ name: 'Happy' });
    const model = example();

    const res = await service.commit(id, 'main', { expectedParent: head, message: 'add 3-tier', model });
    expect(res.hash).toBe(hashModel(model));

    const byBranch = await service.getModel(id, 'main');
    expect(byBranch.hash).toBe(res.hash);
    expect(byBranch.model.components).toHaveLength(model.components.length);

    const byHash = await service.getCommit(id, res.hash);
    expect(byHash.parents).toEqual([head]);
    expect(byHash.stats.components).toBe(model.components.length);
  });

  it('stale parent under concurrent commits → 409', async () => {
    const { id, head } = await service.create({ name: 'Concurrent' });
    await service.commit(id, 'main', { expectedParent: head, message: 'first', model: example() });

    // A second commit still based on the original (now stale) head must conflict.
    let status = 0;
    try {
      await service.commit(id, 'main', { expectedParent: head, message: 'stale', model: { ...example(), name: 'changed' } });
      expect.unreachable('expected a 409');
    } catch (err) {
      status = statusOf(err);
    }
    expect(status).toBe(409);
  });

  it('invalid model → 422 with element-path errors', async () => {
    const { id, head } = await service.create({ name: 'Invalid' });
    const bad = example();
    bad.components.find((c) => c.id === 'orders-db')!.properties!['instanceClass'] = 'huge';

    let status = 0;
    let errors: Array<{ message: string }> = [];
    try {
      await service.commit(id, 'main', { expectedParent: head, message: 'bad', model: bad });
      expect.unreachable('expected a 422');
    } catch (err) {
      status = statusOf(err);
      const body = (err as HttpException).getResponse() as { errors?: Array<{ message: string }> };
      errors = body.errors ?? [];
    }
    expect(status).toBe(422);
    expect(errors.some((e) => e.message.includes('instanceClass'))).toBe(true);
  });

  it('the same model commits to a stable hash across independent architectures', async () => {
    const a = await service.create({ name: 'StableA' });
    const ra = await service.commit(a.id, 'main', { expectedParent: a.head, message: 'm', model: example() });
    const b = await service.create({ name: 'StableB' });
    const rb = await service.commit(b.id, 'main', { expectedParent: b.head, message: 'm', model: example() });

    expect(ra.hash).toBe(rb.hash);
    expect(ra.hash).toBe(hashModel(example()));
  });
});

describe('History, diff, and seed (integration)', () => {
  it('seed is rerunnable and builds multi-commit histories with stable hashes', async () => {
    const first = await seedDatabase(pool, catalog);
    const second = await seedDatabase(pool, catalog);
    expect(first).toHaveLength(3);
    expect(first.every((s) => s.commits.length >= 3)).toBe(true);
    expect(second.map((s) => s.commits.map((c) => c.hash))).toEqual(first.map((s) => s.commits.map((c) => c.hash)));
  });

  it('GET commits returns the seeded history newest-first', async () => {
    const seeds = await seedDatabase(pool, catalog);
    const arch = seeds[0]!;
    const { commits } = await service.listCommits(arch.id, {});
    expect(commits).toHaveLength(arch.commits.length);
    expect(commits[0]!.hash).toBe(arch.commits[arch.commits.length - 1]!.hash); // newest first
    expect(commits.at(-1)!.hash).toBe(arch.commits[0]!.hash);
  });

  it('keyset pagination walks the whole history without overlap', async () => {
    const seeds = await seedDatabase(pool, catalog);
    const arch = seeds[0]!; // 4 commits
    const page1 = await service.listCommits(arch.id, { limit: 2 });
    expect(page1.commits).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await service.listCommits(arch.id, { limit: 2, cursor: page1.nextCursor! });
    const seen = [...page1.commits, ...page2.commits].map((c) => c.hash);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(arch.commits.length);
  });

  it('diff endpoint output matches the caml-package diff for seeded histories', async () => {
    const seeds = await seedDatabase(pool, catalog);
    const arch = seeds[0]!;
    const firstCommit = arch.commits[0]!;
    const lastCommit = arch.commits.at(-1)!;
    const res = await service.diff(arch.id, firstCommit.hash, lastCommit.hash);
    expect(res.from).toBe(firstCommit.hash);
    expect(res.to).toBe(lastCommit.hash);
    expect(res.diff).toEqual(diffModels(firstCommit.model, lastCommit.model));
  });

  it('diff resolves a branch name (main) to its head', async () => {
    const seeds = await seedDatabase(pool, catalog);
    const arch = seeds[0]!;
    const firstCommit = arch.commits[0]!;
    const lastCommit = arch.commits.at(-1)!;
    const res = await service.diff(arch.id, firstCommit.hash, 'main');
    expect(res.to).toBe(lastCommit.hash); // main head = last seeded commit
  });
});
