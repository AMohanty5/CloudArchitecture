import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { hashModel } from '@cac/caml';
import type { CamlDocument } from '@cac/caml';
import { loadCatalog } from '@cac/catalog';
import { runMigrations } from '../../src/database/migrate';
import { DEFAULT_TENANT_ID } from '../../src/config/config';
import { ArchitectureRepository } from '../../src/modules/architecture/architecture.repository';
import { ArchitectureService } from '../../src/modules/architecture/architecture.service';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, '../../../../catalog');
const examplePath = path.resolve(here, '../../../../packages/catalog/fixtures/web-3tier.example.json');
const example = (): CamlDocument => JSON.parse(readFileSync(examplePath, 'utf8'));

let container: StartedPostgreSqlContainer;
let pool: Pool;
let service: ArchitectureService;

const statusOf = (err: unknown): number => (err instanceof HttpException ? err.getStatus() : 0);

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({
    connectionString: container.getConnectionUri(),
    options: `-c app.tenant_id=${DEFAULT_TENANT_ID}`,
  });
  await runMigrations(pool);
  service = new ArchitectureService(new ArchitectureRepository(pool), loadCatalog(catalogDir));
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
