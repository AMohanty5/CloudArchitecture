import { describe, expect, it } from 'vitest';
import { deriveMetrics, filterSortArchitectures, pushRecent, scoreFromReport, toggleInSet } from './useArchHub';
import type { ArchitectureSummary } from './queries';

const a = (over: Partial<ArchitectureSummary> & { id: string; name: string }): ArchitectureSummary => ({
  description: null,
  defaultBranch: 'main',
  lifecycle: 'draft',
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  ...over,
});

const items: ArchitectureSummary[] = [
  a({ id: '1', name: 'Multi-AZ HA', lifecycle: 'approved', createdAt: '2026-06-22T00:00:00Z', updatedAt: '2026-06-23T12:00:00Z', description: 'ALB + RDS' }),
  a({ id: '2', name: 'test2', lifecycle: 'draft', createdAt: '2026-06-23T00:00:00Z', updatedAt: '2026-06-23T01:00:00Z' }),
  a({ id: '3', name: 'Bedrock RAG', lifecycle: 'draft', createdAt: '2026-06-21T00:00:00Z', updatedAt: '2026-06-22T00:00:00Z', description: 'Kendra + Bedrock' }),
];

describe('filterSortArchitectures', () => {
  const base = { query: '', status: 'all', favoritesOnly: false };
  it('sorts newest-first by created date', () => {
    expect(filterSortArchitectures(items, base, 'created-desc', new Set()).map((x) => x.id)).toEqual(['2', '1', '3']);
  });
  it('sorts by last-modified (default)', () => {
    expect(filterSortArchitectures(items, base, 'modified-desc', new Set()).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
  it('sorts by name', () => {
    expect(filterSortArchitectures(items, base, 'name-asc', new Set()).map((x) => x.name)).toEqual(['Bedrock RAG', 'Multi-AZ HA', 'test2']);
  });
  it('searches name + description, case-insensitive', () => {
    expect(filterSortArchitectures(items, { ...base, query: 'bedrock' }, 'name-asc', new Set()).map((x) => x.id)).toEqual(['3']);
    expect(filterSortArchitectures(items, { ...base, query: 'rds' }, 'name-asc', new Set()).map((x) => x.id)).toEqual(['1']);
  });
  it('filters by status', () => {
    expect(filterSortArchitectures(items, { ...base, status: 'draft' }, 'name-asc', new Set()).map((x) => x.id).sort()).toEqual(['2', '3']);
  });
  it('filters to favorites only', () => {
    expect(filterSortArchitectures(items, { ...base, favoritesOnly: true }, 'name-asc', new Set(['1'])).map((x) => x.id)).toEqual(['1']);
  });
});

describe('deriveMetrics', () => {
  it('counts total and by status', () => {
    const m = deriveMetrics(items);
    expect(m.total).toBe(3);
    expect(m.byStatus).toEqual({ approved: 1, draft: 2 });
  });
});

describe('scoreFromReport', () => {
  it('maps severities to a 0–100 score with error/warning counts', () => {
    expect(scoreFromReport({ total: 0, bySeverity: {} })).toEqual({ score: 100, errors: 0, warnings: 0, total: 0 });
    const s = scoreFromReport({ total: 3, bySeverity: { critical: 1, medium: 2 } });
    expect(s.score).toBe(100 - 25 - 8); // 67
    expect(s).toMatchObject({ errors: 1, warnings: 2 });
  });
  it('clamps to zero', () => {
    expect(scoreFromReport({ total: 10, bySeverity: { critical: 10 } }).score).toBe(0);
  });
});

describe('prefs reducers', () => {
  it('toggleInSet adds then removes', () => {
    expect([...toggleInSet(new Set(), 'x')]).toEqual(['x']);
    expect([...toggleInSet(new Set(['x']), 'x')]).toEqual([]);
  });
  it('pushRecent dedups, moves to front, and caps', () => {
    expect(pushRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    expect(pushRecent(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    expect(pushRecent(['1', '2', '3'], '4', 3)).toEqual(['4', '1', '2']);
  });
});
