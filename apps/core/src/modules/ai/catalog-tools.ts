import type { Catalog, CatalogService } from '@cac/catalog';

/**
 * Composer grounding tools (blueprint doc 17 shared tool contracts). `catalog_search` and
 * `catalog_schema` let the Composer bind components to *real* catalog services instead of
 * guessing from memory — the same catalog validation uses, so AI and the deterministic
 * engines can't disagree about which services exist. Pure functions over the loaded catalog.
 */

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function typeMatches(svc: CatalogService, abstractType: string): boolean {
  return (svc.abstractTypes ?? []).some((t) => t === abstractType || t.startsWith(`${abstractType}.`) || abstractType.startsWith(`${t}.`));
}

export interface CatalogSearchHit {
  key: string;
  abstractTypes: string[];
  groupKind?: string;
  name: string;
  summary: string;
}

/** Keyword-ranked catalog search, optionally filtered by provider / abstract type. */
export function catalogSearch(
  catalog: Catalog,
  args: { query: string; provider?: string; abstract_type?: string; limit?: number },
): CatalogSearchHit[] {
  const terms = new Set(tokenize(`${args.query} ${args.abstract_type ?? ''}`));
  const hits = [...catalog.servicesByKey.values()]
    .filter((s) => !args.provider || s.provider === args.provider)
    .filter((s) => !args.abstract_type || typeMatches(s, args.abstract_type))
    .map((s) => {
      const hay = new Set([...tokenize(s.key), ...tokenize(s.name), ...tokenize(s.description ?? ''), ...(s.abstractTypes ?? []).flatMap(tokenize)]);
      let score = 0;
      for (const t of terms) if (hay.has(t)) score++;
      return { s, score };
    })
    // When an abstract type is requested, type-compatible services count even at score 0.
    .filter((r) => r.score > 0 || Boolean(args.abstract_type))
    .sort((a, b) => b.score - a.score || a.s.key.localeCompare(b.s.key))
    .slice(0, args.limit ?? 6);

  return hits.map(({ s }) => ({
    key: s.key,
    abstractTypes: s.abstractTypes ?? [],
    groupKind: s.groupKind,
    name: s.name,
    summary: s.description ?? '',
  }));
}

export type CatalogSchemaResult =
  | { key: string; abstractTypes?: string[]; groupKind?: string; properties: Record<string, unknown>; connectionRules: Record<string, unknown> }
  | { error: string };

/** Full property schema + connection rules for a service key (or an error for unknown keys). */
export function catalogSchema(catalog: Catalog, serviceKey: string): CatalogSchemaResult {
  const s = catalog.servicesByKey.get(serviceKey);
  if (!s) return { error: `unknown service "${serviceKey}" — call catalog_search and bind only to keys it returns` };
  return {
    key: s.key,
    abstractTypes: s.abstractTypes,
    groupKind: s.groupKind,
    properties: (s.properties ?? {}) as Record<string, unknown>,
    connectionRules: (s.connectionRules ?? {}) as Record<string, unknown>,
  };
}
