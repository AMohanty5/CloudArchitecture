import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reference-pattern corpus (blueprint doc 07). Curated partial-CAML sketches (abstract
 * types only, no service bindings) that the Design Planner composes from. `pattern_fetch`
 * is keyword search over them — a deliberately simple v0 (no embeddings yet); the planner
 * cites what it adopts. Same prompts-as-code discipline as the registry: reviewed JSON.
 */

export interface PatternCapability {
  abstract_type: string;
  purpose: string;
}
export interface PatternConnection {
  from: string;
  to: string;
  kind: string;
}
export interface PatternSpec {
  id: string;
  name: string;
  tags: string[];
  applicability: string;
  capabilities: PatternCapability[];
  groups: string[];
  connections: PatternConnection[];
  citations: string[];
}

export type PatternStore = readonly PatternSpec[];

export function loadPatterns(rootDir: string): PatternStore {
  const files = readdirSync(rootDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const out: PatternSpec[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(rootDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`${file}: invalid pattern JSON: ${(err as Error).message}`);
    }
    const p = parsed as PatternSpec;
    if (!p.id || !Array.isArray(p.capabilities)) throw new Error(`${file}: pattern missing id/capabilities`);
    out.push(p);
  }
  return out;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
}

/** A compact, model-facing view of a pattern (what `pattern_fetch` returns). */
export interface PatternResult {
  id: string;
  name: string;
  applicability: string;
  capabilities: PatternCapability[];
  connections: PatternConnection[];
  citations: string[];
  score: number;
}

/**
 * `pattern_fetch`: rank patterns by keyword overlap of the `need` (+ optional `tags`)
 * against each pattern's tags/name/applicability/capability types. Returns the top `limit`.
 */
export function searchPatterns(
  store: PatternStore,
  args: { need: string; tags?: string[]; limit?: number },
): PatternResult[] {
  const queryTerms = new Set([...tokenize(args.need), ...(args.tags ?? []).flatMap(tokenize)]);
  const ranked = store
    .map((p) => {
      const haystack = new Set([
        ...p.tags.flatMap(tokenize),
        ...tokenize(p.name),
        ...tokenize(p.applicability),
        ...p.capabilities.flatMap((c) => tokenize(c.abstract_type)),
      ]);
      let score = 0;
      for (const term of queryTerms) if (haystack.has(term)) score++;
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .slice(0, args.limit ?? 3);

  return ranked.map(({ p, score }) => ({
    id: p.id,
    name: p.name,
    applicability: p.applicability,
    capabilities: p.capabilities,
    connections: p.connections,
    citations: p.citations,
    score,
  }));
}
