import type { CatalogService } from '@cac/catalog';

export interface RankedService {
  service: CatalogService;
  score: number;
}

/** Lowercased haystacks searched per service, weighted by field. */
function haystacks(s: CatalogService): { name: string; key: string; types: string; caps: string } {
  return {
    name: s.name.toLowerCase(),
    key: s.key.toLowerCase(),
    types: [...(s.abstractTypes ?? []), s.groupKind ?? ''].join(' ').toLowerCase(),
    caps: Object.keys(s.capabilities ?? {}).join(' ').toLowerCase(),
  };
}

function scoreService(s: CatalogService, query: string, tokens: string[]): number {
  const h = haystacks(s);
  let score = 0;
  if (h.name === query || h.key === query) score += 100;
  for (const t of tokens) {
    if (h.name.includes(t)) score += 10;
    if (h.key.includes(t)) score += 6;
    if (h.types.includes(t)) score += 4;
    if (h.caps.includes(t)) score += 2;
  }
  if (tokens.length > 0 && tokens.every((t) => h.name.includes(t))) score += 20; // all query words in the name
  return score;
}

/**
 * Rank catalog services for the palette. With no query, returns all (optionally
 * provider-filtered) sorted by name; with a query, returns only matches sorted by
 * relevance then key. Pure + deterministic — the search endpoint's core.
 */
export function rankServices(
  services: CatalogService[],
  opts: { q?: string; provider?: string } = {},
): RankedService[] {
  let pool = services;
  if (opts.provider) pool = pool.filter((s) => s.provider === opts.provider);

  const query = (opts.q ?? '').trim().toLowerCase();
  if (!query) {
    return [...pool]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((service) => ({ service, score: 0 }));
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  return pool
    .map((service) => ({ service, score: scoreService(service, query, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.service.key.localeCompare(b.service.key));
}
