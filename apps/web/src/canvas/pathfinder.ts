import { evaluateConnection, makeConnectionId, type Endpoint } from './connections';
import { componentFromService, makeComponentId, type Command, type ServiceLike } from './commands';
import type { ConnectionRules } from '../lib/queries';

/**
 * Rules-graph intermediary path-finder (Day 98, docs/architecture-intelligence.md §4).
 *
 * The catalog `connectionRules` already form a directed relationship graph over abstract
 * types. When two services can't connect directly (EventBridge → S3, CloudWatch → S3 —
 * the reported logical errors) there is often a valid path *through an intermediary*
 * (EventBridge → Lambda → S3). This module builds that type-graph and finds the shortest
 * insertable paths. Pure + deterministic.
 *
 * It reuses `evaluateConnection` for every edge, so a found path is — by construction — a
 * chain of individually-valid directed connections. Only forward (non-`flip`) flow edges
 * are followed: a structural attach/peer drawn backwards is not a transit hop.
 */

/** A catalog service projected onto a single abstract type (multi-type services appear once per type). */
export interface GraphService {
  key: string;
  type: string;
  rules?: ConnectionRules;
}

/** One hop of a suggested path: the type to insert + its representative service + the kind in. */
export interface PathStep {
  type: string;
  /** Representative catalog service key for `type` (what auto-correction would insert). */
  serviceKey: string;
  /** Connection kind on the edge entering this step (smart default from the matched rule). */
  kind: string;
}

interface Edge {
  to: string;
  kind: string;
}

export interface RulesGraph {
  /** All concrete service types that are graph nodes. */
  nodes: Set<string>;
  /** Directed adjacency: type → forward flow edges (sorted, deterministic). */
  edges: Map<string, Edge[]>;
  /** type → representative service key (deterministic: lowest key wins). */
  representative: Map<string, string>;
}

/**
 * Build the directed type-graph from a flat list of catalog services. A node is a service's
 * abstract type; a directed edge `a → b` exists when `evaluateConnection` permits a forward
 * (non-flip) connection from `a`'s representative to `b`'s. Edge kind = the smart-default kind.
 */
export function buildRulesGraph(services: GraphService[]): RulesGraph {
  const representative = new Map<string, string>();
  const repRules = new Map<string, ConnectionRules | undefined>();
  for (const s of services) {
    if (!s.type) continue;
    const current = representative.get(s.type);
    if (current === undefined || s.key < current) {
      representative.set(s.type, s.key);
      repRules.set(s.type, s.rules);
    }
  }

  const nodes = new Set(representative.keys());
  const endpoint = (type: string): Endpoint => ({ type, rules: repRules.get(type) });

  const edges = new Map<string, Edge[]>();
  for (const a of nodes) {
    const out: Edge[] = [];
    for (const b of nodes) {
      if (a === b) continue;
      const v = evaluateConnection(endpoint(a), endpoint(b));
      if (v.allowed && !v.flip && v.kinds.length > 0) {
        out.push({ to: b, kind: v.kinds[0]! });
      }
    }
    out.sort((x, y) => x.to.localeCompare(y.to));
    edges.set(a, out);
  }

  return { nodes, edges, representative };
}

/**
 * A rich 4-state connection verdict (Day 99, docs/architecture-intelligence.md §3) — the
 * advisor's reply, upgraded from the boolean `evaluateConnection`:
 * - `supported` — a direct rule matches (today's `allowed`).
 * - `discouraged` — a direct rule matches but a curated anti-pattern flags it (Day 102 metadata; not yet emitted).
 * - `needs-intermediary` — no direct rule, but a path through intermediaries exists → carry it.
 * - `unsupported` — no direct rule and no path within depth.
 */
export type ConnectionAssessment =
  | { status: 'supported'; kind: string }
  | { status: 'discouraged'; kind: string; reason: string }
  | { status: 'needs-intermediary'; path: PathStep[]; alternatives: PathStep[][]; reason: string }
  | { status: 'unsupported'; reason: string };

/**
 * Assess a candidate `source → target` connection. Reuses `evaluateConnection` for the direct
 * verdict, then falls back to `findIntermediaryPaths` over `graph` when there's no direct rule
 * — so a rejected EventBridge → S3 becomes "route via Lambda" instead of a bare rejection.
 * `nameOf` maps a representative service key to a display name for the reason text. Pure.
 */
export function assessConnection(
  source: Endpoint,
  target: Endpoint,
  graph?: RulesGraph,
  nameOf: (serviceKey: string) => string = (k) => k,
): ConnectionAssessment {
  const direct = evaluateConnection(source, target);
  if (direct.allowed) {
    // `discouraged` awaits the curated anti-pattern metadata (Day 102); until then a direct
    // match is plainly supported.
    return { status: 'supported', kind: direct.kinds[0]! };
  }

  if (graph) {
    const paths = findIntermediaryPaths(graph, source.type, target.type);
    if (paths.length > 0) {
      const [best, ...alternatives] = paths;
      const intermediaries = best!.slice(0, -1).map((s) => nameOf(s.serviceKey));
      return {
        status: 'needs-intermediary',
        path: best!,
        alternatives,
        reason: `No direct connection — route via ${intermediaries.join(' → ')}`,
      };
    }
  }

  return { status: 'unsupported', reason: direct.reason ?? `${source.type} cannot connect to ${target.type}` };
}

export interface PathfindOptions {
  /** Maximum number of edges in a path (≤ 3 → at most 2 intermediaries). */
  maxDepth?: number;
  /** Maximum number of paths returned. */
  maxPaths?: number;
}

/**
 * Find insertable paths from `sourceType` to `targetType` that pass *through at least one
 * intermediary*. Returns each path as the steps after the source (intermediaries… + target),
 * shortest first then deterministic, capped at `maxPaths`. Empty when source/target are the
 * same, either type is unknown, or no path exists within `maxDepth`.
 */
export function findIntermediaryPaths(
  graph: RulesGraph,
  sourceType: string,
  targetType: string,
  { maxDepth = 3, maxPaths = 3 }: PathfindOptions = {},
): PathStep[][] {
  if (sourceType === targetType) return [];
  if (!graph.nodes.has(sourceType) || !graph.nodes.has(targetType)) return [];

  const results: { type: string; kind: string }[][] = [];
  const visited = new Set<string>([sourceType]);

  const dfs = (node: string, trail: { type: string; kind: string }[]): void => {
    for (const edge of graph.edges.get(node) ?? []) {
      if (visited.has(edge.to)) continue;
      const next = [...trail, { type: edge.to, kind: edge.kind }];
      if (edge.to === targetType) {
        // Only keep paths that actually route through an intermediary.
        if (next.length >= 2) results.push(next);
        continue;
      }
      if (next.length < maxDepth) {
        visited.add(edge.to);
        dfs(edge.to, next);
        visited.delete(edge.to);
      }
    }
  };
  dfs(sourceType, []);

  results.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.map((s) => s.type).join('>').localeCompare(b.map((s) => s.type).join('>'));
  });

  return results.slice(0, maxPaths).map((trail) =>
    trail.map((step) => ({
      type: step.type,
      serviceKey: graph.representative.get(step.type)!,
      kind: step.kind,
    })),
  );
}

export interface PathInsertion {
  /** AddComponent (per intermediary) + Connect (per hop) — apply in order as one undoable step. */
  commands: Command[];
  /** Ids of the newly-created intermediary components (for layout placement). */
  insertedIds: string[];
}

/**
 * Materialize an intermediary `path` (the output of `findIntermediaryPaths`) as a list of
 * commands (Day 101, docs/architecture-intelligence.md §6). The last step is the *existing*
 * target — only the steps before it are inserted as new components; then the chain
 * `source → I₁ → … → target` is wired with each step's kind. Pure: id minting is the only
 * non-determinism (as elsewhere in the command bus). Returns null if a service can't be resolved.
 */
export function buildPathInsertion(
  sourceId: string,
  targetId: string,
  path: PathStep[],
  serviceFor: (serviceKey: string) => ServiceLike | undefined,
): PathInsertion | null {
  if (path.length === 0) return null;
  const commands: Command[] = [];
  const insertedIds: string[] = [];
  let prev = sourceId;
  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;
    const isTarget = i === path.length - 1;
    let nodeId: string;
    if (isTarget) {
      nodeId = targetId; // the connection's existing endpoint — never re-created
    } else {
      const service = serviceFor(step.serviceKey);
      const component = service ? componentFromService(service, makeComponentId(step.serviceKey)) : null;
      if (!component) return null;
      commands.push({ type: 'AddComponent', component });
      insertedIds.push(component.id);
      nodeId = component.id;
    }
    commands.push({ type: 'Connect', connection: { id: makeConnectionId(), from: prev, to: nodeId, kind: step.kind } });
    prev = nodeId;
  }
  return { commands, insertedIds };
}
