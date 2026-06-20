/**
 * Projector v1 (blueprint doc 06 derivation layer): CAML + optional layout →
 * React Flow nodes/edges. Pure and deterministic. When no layout sidecar is
 * supplied it computes a simple nested box layout (real auto-layout = ELK, Day 18)
 * so a freshly-committed model still renders with intact group containment.
 */

import { edgeStyle } from './connections';
import { NODE } from './theme';

export interface CamlComponent {
  id: string;
  name: string;
  type: string;
  binding?: { provider: string; service: string };
  group?: string;
  properties?: Record<string, unknown>;
}
export interface ConnectionProperties {
  protocol?: string;
  port?: number;
  encrypted?: boolean;
  [key: string]: unknown;
}
export interface CamlConnection {
  id: string;
  from: string;
  to: string;
  kind: string;
  direction?: 'uni' | 'bi';
  name?: string;
  properties?: ConnectionProperties;
}
export interface CamlGroup {
  id: string;
  kind: string;
  name: string;
  parent?: string;
  provider?: string;
  properties?: Record<string, unknown>;
}
export interface ProjectableModel {
  components?: CamlComponent[];
  connections?: CamlConnection[];
  groups?: CamlGroup[];
}

/**
 * Sidecar layout (overrides the auto-layout): per-node positions, plus per-group
 * sizes (so an ELK "tidy up" can size containers to their spread-out children).
 * Positions are in the node's React Flow coordinate space (parent-relative for
 * nested nodes), matching ELK's hierarchical output.
 */
export interface LayoutSidecar {
  positions?: Record<string, { x: number; y: number }>;
  sizes?: Record<string, { width: number; height: number }>;
}

export interface ProjectedNode {
  id: string;
  type: 'service' | 'group';
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: 'parent';
  style?: { width: number; height: number };
}
export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  data: { kind: string };
  style: { stroke: string; strokeDasharray?: string };
  /** Set when the connection is bidirectional (renders arrowheads at both ends). */
  bidirectional?: boolean;
}
export interface Projection {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

const NODE_W: number = NODE.width;
const NODE_H: number = NODE.height;
const PAD = 14;
const HEADER = 34;
const GAP = 12;
/** Section-panel geometry (Day 41): a `tier` group renders its components as compact rows. */
const ROW_H = 30;
const SECTION_W = NODE_W + 2 * PAD;

/** A `tier` group whose direct children are all components renders as a section panel. */
function isSectionGroup(groupId: string, groupsByParent: Map<string | undefined, CamlGroup[]>, componentsByGroup: Map<string | undefined, CamlComponent[]>, kind: string): boolean {
  return kind === 'tier' && (componentsByGroup.get(groupId)?.length ?? 0) > 0 && (groupsByParent.get(groupId)?.length ?? 0) === 0;
}

function bucket<T>(map: Map<string | undefined, T[]>, key: string | undefined, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function project(model: ProjectableModel, layout?: LayoutSidecar): Projection {
  const groupsByParent = new Map<string | undefined, CamlGroup[]>();
  for (const g of model.groups ?? []) bucket(groupsByParent, g.parent, g);
  const componentsByGroup = new Map<string | undefined, CamlComponent[]>();
  for (const c of model.components ?? []) bucket(componentsByGroup, c.group, c);

  const nodes: ProjectedNode[] = [];
  // componentId → section group it is rendered inside as a row (its node is not emitted).
  const rowifiedToGroup = new Map<string, string>();

  // Lay out the direct children of `parentId`, positioned relative to it, and
  // return the content size so the parent group node can be sized to fit.
  function layoutContainer(parentId: string | undefined): { width: number; height: number } {
    const startX = parentId === undefined ? 0 : PAD;
    let y = parentId === undefined ? 0 : HEADER + PAD - GAP; // first GAP is added back below
    let maxRight = NODE_W;

    for (const g of groupsByParent.get(parentId) ?? []) {
      y += GAP;
      const section = isSectionGroup(g.id, groupsByParent, componentsByGroup, g.kind);
      const rows = section ? (componentsByGroup.get(g.id) ?? []) : [];
      const node: ProjectedNode = {
        id: g.id,
        type: 'group',
        parentId,
        extent: parentId ? 'parent' : undefined,
        position: { x: startX, y },
        data: {
          label: g.name,
          kind: g.kind,
          ...(section ? { items: rows.map((c) => ({ id: c.id, name: c.name, type: c.type, service: c.binding?.service })) } : {}),
        },
        style: { width: NODE_W, height: HEADER }, // backfilled below
      };
      nodes.push(node); // parent must precede its children in the node list
      let size: { width: number; height: number };
      if (section) {
        // Components become rows inside this panel — not separate nodes; edges remap to it.
        for (const c of rows) rowifiedToGroup.set(c.id, g.id);
        size = { width: SECTION_W, height: HEADER + rows.length * ROW_H + PAD };
      } else {
        size = layoutContainer(g.id);
      }
      node.style = size;
      y += size.height;
      maxRight = Math.max(maxRight, startX + size.width);
    }

    for (const c of componentsByGroup.get(parentId) ?? []) {
      y += GAP;
      nodes.push({
        id: c.id,
        type: 'service',
        parentId,
        extent: parentId ? 'parent' : undefined,
        position: { x: startX, y },
        data: { name: c.name, type: c.type, service: c.binding?.service, provider: c.binding?.provider },
        style: { width: NODE_W, height: NODE_H },
      });
      y += NODE_H;
      maxRight = Math.max(maxRight, startX + NODE_W);
    }

    return {
      width: Math.max(maxRight + (parentId ? PAD : 0), NODE_W + 2 * PAD),
      height: y + (parentId ? PAD : 0),
    };
  }

  layoutContainer(undefined);

  if (layout?.positions || layout?.sizes) {
    for (const node of nodes) {
      const pos = layout.positions?.[node.id];
      if (pos) node.position = pos;
      const size = layout.sizes?.[node.id];
      if (size && node.type === 'group') node.style = size; // ELK-sized container
    }
  }

  // Edges: an endpoint rendered as a section row has no node, so re-point it to the
  // containing panel (container-to-container, like a reference diagram). Drop edges that
  // collapse within one panel, and collapse duplicate panel↔panel edges of the same kind.
  const edges: ProjectedEdge[] = [];
  const seen = new Set<string>();
  for (const c of model.connections ?? []) {
    const source = rowifiedToGroup.get(c.from) ?? c.from;
    const target = rowifiedToGroup.get(c.to) ?? c.to;
    if (source === target) continue; // intra-section
    const key = `${source}->${target}:${c.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Label = protocol[:port] when present, else the connection kind (shown only when labels are toggled on).
    const protocol = typeof c.properties?.protocol === 'string' ? c.properties.protocol : undefined;
    const port = typeof c.properties?.port === 'number' ? c.properties.port : undefined;
    const label = protocol ? `${protocol}${port ? `:${port}` : ''}` : c.kind;
    const edge: ProjectedEdge = { id: c.id, source, target, label, data: { kind: c.kind }, style: edgeStyle(c.kind) };
    if (c.direction === 'bi') edge.bidirectional = true;
    edges.push(edge);
  }

  return { nodes, edges };
}
