import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { HealthController } from './health.controller';

const fakePool = (ok: boolean): Pool =>
  ({
    query: ok
      ? async () => ({ rows: [{ '?column?': 1 }] })
      : async () => {
          throw new Error('down');
        },
  }) as unknown as Pool;

describe('HealthController', () => {
  it('reports ok with db up and a valid timestamp', async () => {
    const result = await new HealthController(fakePool(true)).check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('core');
    expect(result.db).toBe('up');
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });

  it('reports db down when the query throws', async () => {
    const result = await new HealthController(fakePool(false)).check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('down');
  });
});
