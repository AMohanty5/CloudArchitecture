import type { ConnectionRules } from '../lib/queries';

/** An endpoint of a candidate connection: its abstract type + catalog connection rules. */
export interface Endpoint {
  type: string;
  rules?: ConnectionRules;
}

export interface ConnectionVerdict {
  allowed: boolean;
  /** Permitted connection kinds (first is the smart default). */
  kinds: string[];
  /** Protocols suggested by the matched rules (may be empty). */
  protocols: string[];
  /**
   * True when the rule only matched in the reversed orientation (an undirected
   * structural relationship drawn "backwards"). Callers should store the edge with
   * `from`/`to` swapped so the persisted direction stays semantically correct.
   */
  flip?: boolean;
  /** Human-readable explanation when rejected. */
  reason?: string;
}

/**
 * Connection kinds that model an undirected structural relationship — an attach,
 * association, or peering — rather than a directed flow. EBS↔EC2, SG↔EC2 and
 * VPC-peering↔VPC are all undirected: the user may draw them either way. Flow kinds
 * (`traffic`, `data`, `async`, `replication`) stay strictly directional.
 */
const STRUCTURAL_KINDS = new Set(['dependency', 'peering', 'identity']);

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Endpoint type token for a CAML group (e.g. a VPC, materialized as a `network` group).
 * Groups have a `kind` but no abstract type or service binding, so they can't carry
 * connection rules of their own; a connection to a group is gated by the *component*
 * endpoint's rules referencing `group.<kind>` (e.g. aws.vpc_peering → group.network).
 * The `group.` namespace can't collide with component abstract types.
 */
export function groupEndpointType(kind: string): string {
  return `group.${kind}`;
}

/**
 * Whether a concrete component `type` satisfies a rule entry, allowing subtype
 * descent: a rule that targets `compute.vm` also matches `compute.vm.autoscaling_group`,
 * because an ASG *is a* VM in the taxonomy (doc 05). Matching is one-directional — a
 * rule for `compute.vm.autoscaling_group` does NOT match a plain `compute.vm`.
 */
function typeMatches(ruleTypes: string[] | undefined, type: string): boolean {
  return (ruleTypes ?? []).some((entry) => type === entry || type.startsWith(`${entry}.`));
}

/** Collect the kinds/protocols permitted for `source → target` in that exact orientation. */
function directedMatch(source: Endpoint, target: Endpoint): { kinds: string[]; protocols: string[] } {
  const kinds: string[] = [];
  const protocols: string[] = [];
  for (const rule of source.rules?.outbound ?? []) {
    if (typeMatches(rule.to, target.type)) {
      kinds.push(...(rule.kinds ?? []));
      protocols.push(...(rule.protocols ?? []));
    }
  }
  for (const rule of target.rules?.inbound ?? []) {
    if (typeMatches(rule.from, source.type)) {
      kinds.push(...(rule.kinds ?? []));
      protocols.push(...(rule.protocols ?? []));
    }
  }
  return { kinds, protocols };
}

/**
 * Evaluate whether `source` may connect to `target` using catalog connection rules
 * (doc 14 / doc 06). A connection is permitted when the source declares an outbound
 * rule whose `to` includes the target's abstract type, OR the target declares an
 * inbound rule whose `from` includes the source's abstract type — with subtype descent
 * (`typeMatches`). Pure + deterministic. Smart default kind = the first matched kind.
 *
 * If the forward orientation has no match, structural relationships (attach/associate/
 * peer) are retried reversed: when the reverse match yields a STRUCTURAL_KIND the edge
 * is allowed with `flip: true` so the caller can normalize its stored direction. Flow
 * kinds never flip, so ASG → ALB stays rejected.
 */
export function evaluateConnection(source: Endpoint, target: Endpoint): ConnectionVerdict {
  const forward = directedMatch(source, target);
  if (forward.kinds.length > 0) {
    return { allowed: true, kinds: uniq(forward.kinds), protocols: uniq(forward.protocols) };
  }

  const reverse = directedMatch(target, source);
  const structuralKinds = reverse.kinds.filter((k) => STRUCTURAL_KINDS.has(k));
  if (structuralKinds.length > 0) {
    return { allowed: true, kinds: uniq(structuralKinds), protocols: uniq(reverse.protocols), flip: true };
  }

  return { allowed: false, kinds: [], protocols: [], reason: `${source.type} cannot connect to ${target.type}` };
}

interface EdgeStyle {
  stroke: string;
  strokeDasharray?: string;
}

/** Kind → line style (blueprint doc 06: kind-styled edges — traffic/data/async/…). */
export function edgeStyle(kind: string): EdgeStyle {
  switch (kind) {
    case 'traffic':
      return { stroke: '#2563eb' }; // solid blue
    case 'data':
      return { stroke: '#059669', strokeDasharray: '6 4' }; // dashed green
    case 'async':
      return { stroke: '#7c3aed', strokeDasharray: '2 4' }; // dotted purple
    case 'replication':
      return { stroke: '#0891b2', strokeDasharray: '6 4' }; // dashed teal
    case 'dependency':
      return { stroke: '#64748b', strokeDasharray: '1 5' }; // dotted slate
    default:
      return { stroke: '#94a3b8' }; // peering/identity/observability — solid gray
  }
}

/** A CAML-safe connection id (`^[a-z][a-z0-9-]{0,63}$`). */
export function makeConnectionId(): string {
  return `conn-${Math.random().toString(36).slice(2, 8)}`;
}
