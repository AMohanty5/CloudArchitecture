import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { Catalog, CatalogService } from '@cac/catalog';
import { CatalogQueryService } from './catalog-query.service';

/** Stubs that force the in-memory fallback (Redis + Postgres both unavailable). */
const failingRedis = { get: async () => { throw new Error('no redis'); }, set: async () => undefined } as unknown as Redis;
const failingPool = { query: async () => { throw new Error('no pg'); } } as unknown as Pool;

const svc = (services: Partial<CatalogService>[]): CatalogQueryService => {
  const catalog = { servicesByKey: new Map(services.map((s) => [s.key!, s as CatalogService])) } as unknown as Catalog;
  return new CatalogQueryService(failingPool, failingRedis, catalog);
};

describe('CatalogQueryService.getAllConnectionRules', () => {
  it('returns rules keyed by service, omitting services with none', async () => {
    const s = svc([
      { key: 'aws.ec2', connectionRules: { inbound: [{ kinds: ['traffic'], from: ['network.loadbalancer.l7'] }] } },
      { key: 'aws.iam' }, // no connection rules
      { key: 'aws.empty', connectionRules: { inbound: [], outbound: [] } }, // empty -> omitted
    ]);
    const rules = await s.getAllConnectionRules();
    expect(Object.keys(rules)).toEqual(['aws.ec2']);
    expect(rules['aws.ec2']?.inbound?.[0]?.from).toContain('network.loadbalancer.l7');
  });
});
