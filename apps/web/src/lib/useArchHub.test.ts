import { describe, expect, it } from 'vitest';
import { deriveMetrics, deriveTags, filterSortArchitectures, parseTags, pruneSelection, pushPrompt, pushRecent, scoreFromReport, selectionStats, toggleInSet } from './useArchHub';
import type { ArchitectureSummary } from './queries';

const a = (over: Partial<ArchitectureSummary> & { id: string; name: string }): ArchitectureSummary => ({
  description: null,
  defaultBranch: 'main',
  lifecycle: 'draft',
  tags: [],
  folderId: null,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  ...over,
});

const items: ArchitectureSummary[] = [
  a({ id: '1', name: 'Multi-AZ HA', lifecycle: 'approved', createdAt: '2026-06-22T00:00:00Z', updatedAt: '2026-06-23T12:00:00Z', description: 'ALB + RDS', tags: ['prod', 'web'], folderId: 'fA' }),
  a({ id: '2', name: 'test2', lifecycle: 'draft', createdAt: '2026-06-23T00:00:00Z', updatedAt: '2026-06-23T01:00:00Z' }),
  a({ id: '3', name: 'Bedrock RAG', lifecycle: 'draft', createdAt: '2026-06-21T00:00:00Z', updatedAt: '2026-06-22T00:00:00Z', description: 'Kendra + Bedrock', tags: ['ml', 'prod'], folderId: 'fA' }),
];

describe('filterSortArchitectures', () => {
  const base = { query: '', status: 'all', favoritesOnly: false, tag: '', folder: 'all' };
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
  it('filters by an exact tag', () => {
    expect(filterSortArchitectures(items, { ...base, tag: 'prod' }, 'name-asc', new Set()).map((x) => x.id).sort()).toEqual(['1', '3']);
    expect(filterSortArchitectures(items, { ...base, tag: 'ml' }, 'name-asc', new Set()).map((x) => x.id)).toEqual(['3']);
  });
  it('search also matches tags', () => {
    expect(filterSortArchitectures(items, { ...base, query: 'web' }, 'name-asc', new Set()).map((x) => x.id)).toEqual(['1']);
  });
  it('filters by folder, and "unfiled" matches only architectures with no folder', () => {
    expect(filterSortArchitectures(items, { ...base, folder: 'fA' }, 'name-asc', new Set()).map((x) => x.id).sort()).toEqual(['1', '3']);
    expect(filterSortArchitectures(items, { ...base, folder: 'unfiled' }, 'name-asc', new Set()).map((x) => x.id)).toEqual(['2']);
    expect(filterSortArchitectures(items, { ...base, folder: 'all' }, 'name-asc', new Set())).toHaveLength(3);
  });
});

describe('deriveTags', () => {
  it('counts distinct tags, most-used first then alphabetical', () => {
    expect(deriveTags(items)).toEqual([
      { tag: 'prod', count: 2 },
      { tag: 'ml', count: 1 },
      { tag: 'web', count: 1 },
    ]);
  });
});

describe('parseTags', () => {
  it('splits on commas/newlines, normalizes, de-dupes, and caps', () => {
    expect(parseTags('Prod, web app\nPROD ,, ')).toEqual(['prod', 'web app']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(','))).toHaveLength(12);
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

describe('pushPrompt', () => {
  const t = '2026-06-24T00:00:00.000Z';
  it('prepends a trimmed prompt and updates its timestamp', () => {
    expect(pushPrompt([], '  build a VPC ', t)).toEqual([{ prompt: 'build a VPC', at: t }]);
  });
  it('de-dupes case-insensitively, moving the prompt to the front with a fresh time', () => {
    const list = [{ prompt: 'web app', at: '2026-06-20T00:00:00Z' }, { prompt: 'data lake', at: '2026-06-21T00:00:00Z' }];
    expect(pushPrompt(list, 'Web App', t)).toEqual([{ prompt: 'Web App', at: t }, { prompt: 'data lake', at: '2026-06-21T00:00:00Z' }]);
  });
  it('ignores a blank prompt and caps the list', () => {
    expect(pushPrompt([{ prompt: 'x', at: t }], '   ', t)).toEqual([{ prompt: 'x', at: t }]);
    const long = Array.from({ length: 4 }, (_, i) => ({ prompt: `p${i}`, at: t }));
    expect(pushPrompt(long, 'new', t, 3).map((e) => e.prompt)).toEqual(['new', 'p0', 'p1']);
  });
});

describe('bulk selection', () => {
  it('selectionStats reports count + header-checkbox state for the visible set', () => {
    const visible = ['1', '2', '3'];
    expect(selectionStats(visible, new Set())).toEqual({ count: 0, allVisibleSelected: false, someVisibleSelected: false });
    expect(selectionStats(visible, new Set(['1']))).toEqual({ count: 1, allVisibleSelected: false, someVisibleSelected: true });
    expect(selectionStats(visible, new Set(['1', '2', '3']))).toEqual({ count: 3, allVisibleSelected: true, someVisibleSelected: false });
  });
  it('selectionStats counts off-screen selections but ignores them for header state', () => {
    // '9' is selected but not in the filtered/visible set → still counted, header not "all".
    expect(selectionStats(['1', '2'], new Set(['1', '2', '9']))).toEqual({ count: 3, allVisibleSelected: true, someVisibleSelected: false });
  });
  it('selectionStats treats an empty visible set as nothing selected', () => {
    expect(selectionStats([], new Set(['1']))).toMatchObject({ allVisibleSelected: false, someVisibleSelected: false });
  });
  it('pruneSelection drops absent ids and preserves the ref when unchanged', () => {
    const sel = new Set(['1', '2', '3']);
    expect([...pruneSelection(sel, ['1', '3'])].sort()).toEqual(['1', '3']);
    expect(pruneSelection(sel, ['1', '2', '3', '4'])).toBe(sel); // no removals → same ref (no re-render)
  });
});
