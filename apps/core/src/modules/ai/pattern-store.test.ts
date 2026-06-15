import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPatterns, searchPatterns } from './pattern-store';

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/patterns');

describe('pattern store + pattern_fetch', () => {
  const store = loadPatterns(patternsDir);

  it('loads the five seed reference patterns', () => {
    expect([...store].map((p) => p.id).sort()).toEqual([
      'batch-pipeline',
      'event-driven-core',
      'serverless-api',
      'static-site-cdn',
      'web-3tier-ha',
    ]);
  });

  it('patterns are abstract-only (no service bindings)', () => {
    for (const p of store) for (const c of p.capabilities) expect(c.abstract_type).not.toMatch(/^(aws|azure|gcp)\./);
  });

  it('ranks by keyword relevance', () => {
    expect(searchPatterns(store, { need: 'serverless http api with scale to zero' })[0]?.id).toBe('serverless-api');
    expect(searchPatterns(store, { need: 'highly available ecommerce web app with a relational database' })[0]?.id).toBe('web-3tier-ha');
    expect(searchPatterns(store, { need: 'global static content delivery at the edge' })[0]?.id).toBe('static-site-cdn');
  });

  it('honours tags and the result limit', () => {
    const byTags = searchPatterns(store, { need: 'process data', tags: ['warehouse', 'analytics', 'batch'] });
    expect(byTags[0]?.id).toBe('batch-pipeline');
    expect(searchPatterns(store, { need: 'web app database cache', limit: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('returns nothing for an unrelated need', () => {
    expect(searchPatterns(store, { need: 'quantum teleportation blockchain' })).toEqual([]);
  });
});
