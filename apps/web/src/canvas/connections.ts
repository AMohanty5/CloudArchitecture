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
  /** Human-readable explanation when rejected. */
  reason?: string;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Evaluate whether `source` may connect to `target` using catalog connection rules
 * (doc 14 / doc 06). A connection is permitted when the source declares an outbound
 * rule whose `to` includes the target's abstract type, OR the target declares an
 * inbound rule whose `from` includes the source's abstract type. Pure + deterministic.
 * Smart default kind = the first matched kind (source-outbound matches first).
 */
export function evaluateConnection(source: Endpoint, target: Endpoint): ConnectionVerdict {
  const kinds: string[] = [];
  const protocols: string[] = [];

  for (const rule of source.rules?.outbound ?? []) {
    if (rule.to?.includes(target.type)) {
      kinds.push(...(rule.kinds ?? []));
      protocols.push(...(rule.protocols ?? []));
    }
  }
  for (const rule of target.rules?.inbound ?? []) {
    if (rule.from?.includes(source.type)) {
      kinds.push(...(rule.kinds ?? []));
      protocols.push(...(rule.protocols ?? []));
    }
  }

  if (kinds.length === 0) {
    return { allowed: false, kinds: [], protocols: [], reason: `${source.type} cannot connect to ${target.type}` };
  }
  return { allowed: true, kinds: uniq(kinds), protocols: uniq(protocols) };
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
