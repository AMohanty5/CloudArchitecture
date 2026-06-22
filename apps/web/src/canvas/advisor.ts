import type { ConnectionRules } from '../lib/queries';

/**
 * Architecture Advisor (Day 104, docs/architecture-intelligence.md §9). When a resource is
 * selected, surface its curated playbook from the catalog `knowledge` metadata: the targets it
 * should connect to, the named patterns it participates in, and the anti-patterns to avoid.
 * Pure + deterministic; complements the ✦ Suggested chips (valid targets, Day 84).
 */

export interface AdvisorView {
  /** Display names of the recommended target services. */
  recommended: string[];
  /** Anti-patterns: the discouraged target (display name) + why. */
  antiPatterns: { to: string; reason: string }[];
  /** Humanized common-pattern labels. */
  patterns: string[];
}

/** "event-fanout" → "Event Fanout". */
export function humanizePattern(id: string): string {
  return id
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Build the advisor view for the selected resource from its `knowledge` block. `nameForType`
 * resolves an abstract type to a representative service display name (falls back to the raw
 * type). Returns null when the service carries no curated knowledge worth showing.
 */
export function buildAdvisor(
  rules: ConnectionRules | undefined,
  nameForType: (type: string) => string,
): AdvisorView | null {
  const k = rules?.knowledge;
  if (!k) return null;
  const recommended = (k.recommendedTargets ?? []).map(nameForType);
  const antiPatterns = (k.antiPatterns ?? []).map((a) => ({ to: nameForType(a.to), reason: a.reason }));
  const patterns = (k.recommendedPatterns ?? []).map(humanizePattern);
  if (recommended.length === 0 && antiPatterns.length === 0 && patterns.length === 0) return null;
  return { recommended, antiPatterns, patterns };
}
