import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@cac/catalog';
import { catalogSchema, catalogSearch } from './catalog-tools';

const catalog = loadCatalog(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../catalog'));

describe('catalog_search', () => {
  it('ranks by keyword and returns catalog keys + abstract types', () => {
    const hits = catalogSearch(catalog, { query: 'application load balancer' });
    expect(hits[0]?.key).toBe('aws.alb');
    expect(hits[0]?.abstractTypes).toContain('network.loadbalancer.l7');
  });

  it('filters by abstract type (type-compatible even at score 0)', () => {
    const hits = catalogSearch(catalog, { query: 'store', abstract_type: 'database.relational' });
    expect(hits.map((h) => h.key)).toContain('aws.rds');
    expect(hits.every((h) => h.abstractTypes.some((t) => t.startsWith('database')))).toBe(true);
  });

  it('honours the result limit', () => {
    expect(catalogSearch(catalog, { query: 'aws', limit: 3 }).length).toBeLessThanOrEqual(3);
  });
});

describe('catalog_schema', () => {
  it('returns the property schema + connection rules for a known key', () => {
    const schema = catalogSchema(catalog, 'aws.rds');
    expect('error' in schema).toBe(false);
    if (!('error' in schema)) expect(schema.properties).toHaveProperty('instanceClass');
  });

  it('returns an error for an unknown service key', () => {
    expect(catalogSchema(catalog, 'aws.nonexistent')).toEqual({ error: expect.stringContaining('unknown service') });
  });
});
