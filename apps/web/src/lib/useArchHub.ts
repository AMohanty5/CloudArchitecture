import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiBase } from './client';
import type { ArchitectureSummary } from './queries';

/**
 * Architecture Hub logic (P0): pure filter/sort/search + validation-score derivation +
 * favorites/recents prefs (localStorage, mirroring the Day-80 palette prefs). Reuses the
 * existing `export.svg` (thumbnail) and `validate` (score) endpoints — no new backend.
 */

// ---- Endpoint URLs (reuse existing endpoints) ----
export const thumbnailUrl = (id: string, branch: string, theme: 'light' | 'dark' = 'light'): string =>
  `${apiBase}/architectures/${id}/branches/${branch}/export.svg?theme=${theme}`;
const validateUrl = (id: string, branch: string): string => `${apiBase}/architectures/${id}/branches/${branch}/validate`;
export const exportUrls = (id: string, branch: string) => ({
  svg: thumbnailUrl(id, branch),
  terraform: `${apiBase}/architectures/${id}/branches/${branch}/export.tf.zip`,
  hld: `${apiBase}/architectures/${id}/branches/${branch}/export.hld.md`,
  bundle: `${apiBase}/architectures/${id}/branches/${branch}/export.bundle.zip`,
});

// ---- Validation score (0–100 from the severity-graded report) ----
export interface ArchScore {
  score: number;
  errors: number; // critical + high
  warnings: number; // medium + low
  total: number;
}
interface ReportSummary {
  total: number;
  bySeverity: Record<string, number>;
}
export function scoreFromReport(summary: ReportSummary): ArchScore {
  const s = summary.bySeverity ?? {};
  const errors = (s.critical ?? 0) + (s.high ?? 0);
  const warnings = (s.medium ?? 0) + (s.low ?? 0);
  const penalty = 25 * (s.critical ?? 0) + 12 * (s.high ?? 0) + 4 * (s.medium ?? 0) + 1 * (s.low ?? 0);
  return { score: Math.max(0, 100 - penalty), errors, warnings, total: summary.total ?? 0 };
}

/** Lazily fetch a per-architecture validation score (gated on `enabled` so off-screen cards don't run the pack). */
export function useArchScore(id: string, branch: string, enabled: boolean) {
  return useQuery({
    queryKey: ['arch-score', id],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ArchScore> => {
      const res = await fetch(validateUrl(id, branch));
      if (!res.ok) throw new Error('validate failed');
      const data = (await res.json()) as { summary: ReportSummary };
      return scoreFromReport(data.summary);
    },
  });
}

// ---- Filter / sort / search (pure) ----
export type SortKey = 'modified-desc' | 'modified-asc' | 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc';
export interface HubFilter {
  query: string;
  status: string; // 'all' | a lifecycle value
  favoritesOnly: boolean;
  tag: string; // '' = no tag facet selected
  folder: string; // 'all' | 'unfiled' | a folder id
}

export function filterSortArchitectures(
  items: ArchitectureSummary[],
  filter: HubFilter,
  sort: SortKey,
  favorites: ReadonlySet<string>,
): ArchitectureSummary[] {
  const q = filter.query.trim().toLowerCase();
  const matched = items.filter((a) => {
    const tags = a.tags ?? [];
    if (filter.status !== 'all' && a.lifecycle !== filter.status) return false;
    if (filter.favoritesOnly && !favorites.has(a.id)) return false;
    if (filter.tag && !tags.includes(filter.tag)) return false;
    if (filter.folder === 'unfiled' && a.folderId != null) return false;
    if (filter.folder !== 'all' && filter.folder !== 'unfiled' && a.folderId !== filter.folder) return false;
    if (q && !`${a.name} ${a.description ?? ''} ${tags.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const byName = (a: ArchitectureSummary, b: ArchitectureSummary) => a.name.localeCompare(b.name);
  const byCreated = (a: ArchitectureSummary, b: ArchitectureSummary) => a.createdAt.localeCompare(b.createdAt);
  const byModified = (a: ArchitectureSummary, b: ArchitectureSummary) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt);
  return [...matched].sort((a, b) => {
    switch (sort) {
      case 'name-asc':
        return byName(a, b);
      case 'name-desc':
        return byName(b, a);
      case 'created-asc':
        return byCreated(a, b);
      case 'created-desc':
        return byCreated(b, a);
      case 'modified-asc':
        return byModified(a, b);
      default:
        return byModified(b, a); // modified-desc (most-recently-touched first)
    }
  });
}

/** Dashboard metrics derived from the list (no extra fetch). */
export function deriveMetrics(items: ArchitectureSummary[]): { total: number; byStatus: Record<string, number> } {
  const byStatus: Record<string, number> = {};
  for (const a of items) byStatus[a.lifecycle] = (byStatus[a.lifecycle] ?? 0) + 1;
  return { total: items.length, byStatus };
}

// ---- Tags (P2) ----
export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 32;

/** Distinct tags across the list with usage counts, most-used first then alphabetical. Pure. */
export function deriveTags(items: ArchitectureSummary[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of items) for (const t of a.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Parse a comma/newline-separated tag string into normalized tags (mirrors the server's normalizeTags). Pure. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// ---- Favorites + recents (localStorage; pure reducers are unit-tested) ----
const FAV_KEY = 'cac:arch:favorites';
const RECENT_KEY = 'cac:arch:recents';
const RECENT_CAP = 8;

export function toggleInSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// ---- Bulk selection (P2) ----
export interface SelectionStats {
  count: number; // total selected (across all loaded items)
  allVisibleSelected: boolean; // every currently-visible item is selected
  someVisibleSelected: boolean; // ≥1 but not all visible selected (indeterminate header checkbox)
}

/** Header-checkbox + counter state for the visible (filtered) set. Pure. */
export function selectionStats(visibleIds: readonly string[], selected: ReadonlySet<string>): SelectionStats {
  const inView = visibleIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0);
  return {
    count: selected.size,
    allVisibleSelected: visibleIds.length > 0 && inView === visibleIds.length,
    someVisibleSelected: inView > 0 && inView < visibleIds.length,
  };
}

/** Drop selected ids that are no longer present (e.g. after a bulk delete). Returns the same ref when unchanged. Pure. */
export function pruneSelection(selected: ReadonlySet<string>, presentIds: readonly string[]): Set<string> {
  const present = new Set(presentIds);
  const kept = [...selected].filter((id) => present.has(id));
  return kept.length === selected.size ? (selected as Set<string>) : new Set(kept);
}

/** Multi-select state for the Hub grid (selection lives in memory only, not persisted). */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => setSelected((s) => toggleInSet(s, id)), []);
  const clear = useCallback(() => setSelected((s) => (s.size === 0 ? s : new Set())), []);
  const selectMany = useCallback((ids: readonly string[]) => setSelected(new Set(ids)), []);
  const pruneTo = useCallback((ids: readonly string[]) => setSelected((s) => pruneSelection(s, ids)), []);
  return { selected, toggle, clear, selectMany, pruneTo };
}

/** Push `id` to the front of an LRU recents list (dedup, capped). Pure. */
export function pushRecent(list: readonly string[], id: string, cap = RECENT_CAP): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, cap);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useArchPrefs() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readJson<string[]>(FAV_KEY, [])));
  const [recents, setRecents] = useState<string[]>(() => readJson<string[]>(RECENT_KEY, []));

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = toggleInSet(prev, id);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const addFavorites = useCallback((ids: readonly string[]) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      if (next.size === prev.size) return prev;
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const recordOpen = useCallback((id: string) => {
    setRecents((prev) => {
      const next = pushRecent(prev, id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { favorites, toggleFavorite, addFavorites, recents, recordOpen };
}

// ---- Misc UI helpers ----
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.round(mo / 12)}y ago`;
}

/** IntersectionObserver gate so off-screen cards don't fetch their score/thumbnail eagerly. */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);
  return [ref, inView];
}

export const LIFECYCLES: { value: string; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: '#94a3b8' },
  { value: 'in_review', label: 'In Review', color: '#f59e0b' },
  { value: 'approved', label: 'Approved', color: '#10b981' },
  { value: 'published', label: 'Published', color: '#2563eb' },
  { value: 'archived', label: 'Archived', color: '#cbd5e1' },
  { value: 'template', label: 'Template', color: '#8b5cf6' },
];
export const lifecycleMeta = (value: string) => LIFECYCLES.find((l) => l.value === value) ?? { value, label: value, color: '#94a3b8' };
