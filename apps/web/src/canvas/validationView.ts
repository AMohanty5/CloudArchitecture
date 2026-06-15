import type { Severity } from '../lib/queries';

/** Severity palette shared by the validation panel and the canvas finding badges (Day 26). */
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#ca8a04',
  info: '#64748b',
};

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** The most severe of a set of severities (for a node carrying several findings). */
export function worstSeverity(severities: Severity[]): Severity | undefined {
  return severities.length === 0 ? undefined : [...severities].sort((a, b) => RANK[a] - RANK[b])[0];
}

/** Map findings (targetId → worst severity) for canvas highlighting. */
export function findingSeverityByTarget(findings: { targetId: string; severity: Severity }[]): Record<string, Severity> {
  const groups = new Map<string, Severity[]>();
  for (const f of findings) {
    const list = groups.get(f.targetId);
    if (list) list.push(f.severity);
    else groups.set(f.targetId, [f.severity]);
  }
  const out: Record<string, Severity> = {};
  for (const [id, sevs] of groups) out[id] = worstSeverity(sevs)!;
  return out;
}
