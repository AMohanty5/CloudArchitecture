import type { CamlDocument, Component, Connection, Group, Requirement } from '@cac/caml';
import { indexModel } from '@cac/caml';

/**
 * The validation engine (blueprint doc 16). Pass 3 of the validation pipeline:
 * advisory *semantic* findings (reliability/security/perf/cost/ops), distinct from
 * the hard structural/catalog errors that gate the commit path. Doc 12 risk note:
 * deterministic validation must read as separate from AI opinion — so this is a
 * pure function of the model, severity-graded, and never blocks a write.
 *
 * Doc 16 specifies two engines (CEL predicates + Cypher graph rules) over one IR.
 * In the prototype both run in-process over the flattened model + a small graph
 * helper — no CEL/Neo4j yet, same rule shape, so the Phase-3 engine swap is
 * mechanical. Rules are TypeScript predicates returning findings.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'reliability' | 'security' | 'performance' | 'cost' | 'operations';

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export interface Finding {
  ruleId: string;
  title: string;
  category: Category;
  severity: Severity;
  /** Component/connection/group id the finding is anchored to (for canvas highlighting). */
  targetId: string;
  message: string;
  remediation?: string;
  /** True when a mechanically-safe one-click CAML patch exists (doc 16 SEC-001 pattern). */
  autoFixable?: boolean;
}

export interface Rule {
  id: string;
  title: string;
  category: Category;
  evaluate(ctx: RuleContext): Finding[];
}

/** Read-only view of the model with the lookups + graph helpers rules need. */
export interface RuleContext {
  model: CamlDocument;
  components: Component[];
  connections: Connection[];
  groups: Group[];
  requirements: Requirement[];
  componentsById: ReadonlyMap<string, Component>;
  groupsById: ReadonlyMap<string, Group>;
  /** Nearest enclosing group (the component's own group, then ancestors) of the given kind. */
  enclosingGroupOfKind(componentId: string, kind: string): Group | undefined;
  /**
   * Graph reachability over traffic/data edges: is any node matching `target`
   * reachable from `fromId` without routing through an intermediate node matching
   * `blockedBy` (an allowed intermediary, e.g. a WAF)? Returns the first hit + path.
   */
  reaches(
    fromId: string,
    target: (c: Component) => boolean,
    blockedBy?: (c: Component) => boolean,
  ): { hit: Component; path: string[] } | undefined;
}

const FLOW_KINDS = new Set<Connection['kind']>(['traffic', 'data']);

export function buildContext(model: CamlDocument): RuleContext {
  const index = indexModel(model);
  const components = model.components ?? [];
  const groups = model.groups ?? [];
  const connections = model.connections ?? [];

  const outgoing = new Map<string, Connection[]>();
  for (const cn of connections) {
    if (!FLOW_KINDS.has(cn.kind)) continue;
    const list = outgoing.get(cn.from);
    if (list) list.push(cn);
    else outgoing.set(cn.from, [cn]);
  }

  const enclosingGroupOfKind = (componentId: string, kind: string): Group | undefined => {
    let cur = index.componentsById.get(componentId)?.group;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      const g = index.groupsById.get(cur);
      if (!g) break;
      if (g.kind === kind) return g;
      seen.add(cur);
      cur = g.parent;
    }
    return undefined;
  };

  const reaches: RuleContext['reaches'] = (fromId, target, blockedBy) => {
    const start = index.componentsById.get(fromId);
    if (!start) return undefined;
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
    const visited = new Set<string>([fromId]);
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const edge of outgoing.get(id) ?? []) {
        const next = index.componentsById.get(edge.to);
        if (!next || visited.has(next.id)) continue;
        if (target(next)) return { hit: next, path: [...path, next.id] };
        // An allowed intermediary (e.g. WAF) cuts the path — don't traverse through it.
        if (blockedBy?.(next)) continue;
        visited.add(next.id);
        queue.push({ id: next.id, path: [...path, next.id] });
      }
    }
    return undefined;
  };

  return {
    model,
    components,
    connections,
    groups,
    requirements: model.requirements ?? [],
    componentsById: index.componentsById,
    groupsById: index.groupsById,
    enclosingGroupOfKind,
    reaches,
  };
}

export interface ValidationReport {
  packVersion: string;
  findings: Finding[];
  summary: { total: number; bySeverity: Record<Severity, number> };
}

/** Run a rule pack over a model, returning a deterministic, severity-sorted report. */
export function runRules(model: CamlDocument, rules: readonly Rule[], packVersion: string): ValidationReport {
  const ctx = buildContext(model);
  const findings = rules.flatMap((r) => r.evaluate(ctx));
  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.targetId.localeCompare(b.targetId),
  );

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  return { packVersion, findings, summary: { total: findings.length, bySeverity } };
}
