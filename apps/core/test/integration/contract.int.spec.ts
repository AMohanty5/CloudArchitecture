import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createCoreClient } from '@cac/api-client';
import type { CoreClient } from '@cac/api-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '../..'); // apps/core
const catalogDir = path.resolve(here, '../../../../catalog');
const examplePath = path.resolve(here, '../../../../packages/catalog/fixtures/web-3tier.example.json');
const example = (): Record<string, unknown> => JSON.parse(readFileSync(examplePath, 'utf8'));

const port = 31_000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${port}`;

let container: StartedPostgreSqlContainer;
let server: ChildProcess;
let client: CoreClient;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok && ((await res.json()) as { db?: string }).db === 'up') return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error('core did not become healthy in time');
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  // The built server runs under node (tsc-emitted decorator metadata), unlike the
  // esbuild-based test runtime — so we drive the real process, not an in-VM app.
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: coreDir,
    env: { ...process.env, DATABASE_URL: container.getConnectionUri(), PORT: String(port), CATALOG_DIR: catalogDir },
    stdio: 'ignore',
  });
  await waitForHealth(60_000);
  client = createCoreClient(`${baseUrl}/api/v1`);
}, 180_000);

afterAll(async () => {
  server?.kill('SIGTERM');
  await container?.stop();
});

describe('Generated client ⇄ running core (contract)', () => {
  it('drives the Day 8–10 surface end to end', async () => {
    // create
    const created = await client.POST('/architectures', { body: { name: 'Contract' } });
    expect(created.response.status).toBe(201);
    const { id, head } = created.data as { id: string; head: string };
    expect(id).toBeTruthy();

    // commit a full model
    const committed = await client.POST('/architectures/{id}/branches/{branch}/commits', {
      params: { path: { id, branch: 'main' } },
      body: { expectedParent: head, message: 'add 3-tier', model: example() },
    });
    const { hash } = committed.data as { hash: string };
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // read the head model (ETag honoured by the server)
    const model = await client.GET('/architectures/{id}/branches/{branch}/model', {
      params: { path: { id, branch: 'main' } },
    });
    expect((model.data as { components: unknown[] }).components).toHaveLength((example().components as unknown[]).length);

    // history + diff
    const commits = await client.GET('/architectures/{id}/commits', { params: { path: { id } } });
    expect((commits.data as { commits: unknown[] }).commits).toHaveLength(2);

    const diff = await client.GET('/architectures/{id}/diff', {
      params: { path: { id }, query: { from: head, to: 'main' } },
    });
    expect((diff.data as { diff: unknown }).diff).toBeDefined();

    // catalog search + detail
    const search = await client.GET('/catalog/services', { params: { query: { q: 'load balancer' } } });
    expect((search.data as Array<{ key: string }>)[0]?.key).toBe('aws.alb');

    const detail = await client.GET('/catalog/services/{key}', { params: { path: { key: 'aws.rds' } } });
    expect((detail.data as { properties: Record<string, unknown> }).properties).toHaveProperty('instanceClass');
  });

  it('surfaces a 409 as a typed error on a stale parent', async () => {
    const created = await client.POST('/architectures', { body: { name: 'Conflict' } });
    const { id, head } = created.data as { id: string; head: string };
    await client.POST('/architectures/{id}/branches/{branch}/commits', {
      params: { path: { id, branch: 'main' } },
      body: { expectedParent: head, message: 'first', model: example() },
    });
    const stale = await client.POST('/architectures/{id}/branches/{branch}/commits', {
      params: { path: { id, branch: 'main' } },
      body: { expectedParent: head, message: 'stale', model: { ...example(), name: 'changed' } },
    });
    expect(stale.response.status).toBe(409);
    expect(stale.error).toBeDefined();
  });
});
