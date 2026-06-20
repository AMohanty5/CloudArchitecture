/**
 * Projector v1 (blueprint doc 06 derivation layer): CAML + optional layout →
 * React Flow nodes/edges. Pure and deterministic. When no layout sidecar is
 * supplied it computes a simple nested box layout (real auto-layout = ELK, Day 18)
 * so a freshly-committed model still renders with intact group containment.
 */

import { edgeStyle } from './connections';

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
}
export interface Projection {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

const NODE_W = 210;
const NODE_H = 72;
const PAD = 20;
const HEADER = 40;
const GAP = 18;

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

  // Lay out the direct children of `parentId`, positioned relative to it, and
  // return the content size so the parent group node can be sized to fit.
  function layoutContainer(parentId: string | undefined): { width: number; height: number } {
    const startX = parentId === undefined ? 0 : PAD;
    let y = parentId === undefined ? 0 : HEADER + PAD - GAP; // first GAP is added back below
    let maxRight = NODE_W;

    for (const g of groupsByParent.get(parentId) ?? []) {
      y += GAP;
      const node: ProjectedNode = {
        id: g.id,
        type: 'group',
        parentId,
        extent: parentId ? 'parent' : undefined,
        position: { x: startX, y },
        data: { label: g.name, kind: g.kind },
        style: { width: NODE_W, height: HEADER }, // backfilled after children
      };
      nodes.push(node); // parent must precede its children in the node list
      const size = layoutContainer(g.id);
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

  const edges: ProjectedEdge[] = (model.connections ?? []).map((c) => ({
    id: c.id,
    source: c.from,
    target: c.to,
    label: c.kind,
    data: { kind: c.kind },
    style: edgeStyle(c.kind),
  }));

  return { nodes, edges };
}
