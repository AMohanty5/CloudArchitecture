/**
 * Projector v1 (blueprint doc 06 derivation layer): CAML + optional layout →
 * React Flow nodes/edges. Pure and deterministic. When no layout sidecar is
 * supplied it computes a simple nested box layout (real auto-layout = ELK, Day 18)
 * so a freshly-committed model still renders with intact group containment.
 */

import { edgeStyle } from './connections';
import { computeBackdrops } from './backdrops';
import type { Rect } from './backdrops';
import { classifyRelationship, foldBucket, groupFoldBucket, secondarySide } from './relationships';
import type { FoldBucket } from './relationships';
import { subnetRole } from './subnets';
import { FOLD, NODE } from './theme';

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

/** A resource folded into an owner node (an attachment row, or a security/identity badge). */
export interface FoldItem {
  id: string;
  name: string;
  type: string;
  service?: string;
}
interface FoldSink {
  attachments: FoldItem[];
  security: FoldItem[];
  identity: FoldItem[];
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
  type: 'service' | 'group' | 'entry';
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: 'parent';
  style?: { width: number; height: number };
  /** Stacking order. Backdrop containers are negative (behind nodes); default 0. */
  zIndex?: number;
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

/** A component reachable directly from the internet — the diagram's flow should start here. */
function isEntryPoint(c: CamlComponent): boolean {
  const t = c.type;
  if (t.startsWith('network.cdn') || t.startsWith('network.gateway.api') || t.startsWith('network.gateway.internet') || t === 'network.loadbalancer.global') return true;
  return t.startsWith('network.loadbalancer') && c.properties?.scheme === 'internet-facing';
}

/** Projection-only id of the synthesized "Internet / Users" origin node. */
const ENTRY_ID = '__internet';

/** A network-link resource (peering / transit gateway / VPN / Direct Connect) that joins VPCs. */
function isNetworkLink(t: string): boolean {
  return t.startsWith('network.link.peering') || t.startsWith('network.link.direct') || t === 'network.gateway.transit' || t === 'network.gateway.vpn';
}
/** Label for a folded network-link connector. */
function linkLabel(t: string): string {
  if (t.startsWith('network.link.peering')) return 'peered';
  if (t === 'network.gateway.transit') return 'transit';
  if (t === 'network.gateway.vpn') return 'vpn';
  if (t.startsWith('network.link.direct')) return 'direct connect';
  return 'link';
}

function bucket<T>(map: Map<string | undefined, T[]>, key: string | undefined, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Projection options. `compose` renders containers as backdrops (Day 70, flagged). */
export interface ProjectOptions {
  compose?: boolean;
}

export function project(model: ProjectableModel, layout?: LayoutSidecar, opts?: ProjectOptions): Projection {
  const base = projectNested(model, layout);
  return opts?.compose ? composeProjection(base, model) : base;
}

function projectNested(model: ProjectableModel, layout?: LayoutSidecar): Projection {
  const groupsByParent = new Map<string | undefined, CamlGroup[]>();
  for (const g of model.groups ?? []) bucket(groupsByParent, g.parent, g);
  const componentsByGroup = new Map<string | undefined, CamlComponent[]>();
  for (const c of model.components ?? []) bucket(componentsByGroup, c.group, c);

  // ---- Fold pre-pass (Day 53) ----------------------------------------------------------
  // Classify every connection; fold non-communication edges (attach/secure/assume) into
  // their owner node and suppress the secondary's standalone node + the edge. Only
  // communication edges survive as lines. See docs/aws-relationship-model.md.
  const componentsById = new Map((model.components ?? []).map((c) => [c.id, c]));
  const groupIds = new Set((model.groups ?? []).map((g) => g.id));
  // Components inside a tier "section panel" render as rows, not composite nodes — folding
  // onto/into them would drop a badge (owner is a row) or vanish the secondary, so skip them.
  const sectionGroupIds = new Set<string>();
  for (const g of model.groups ?? []) if (isSectionGroup(g.id, groupsByParent, componentsByGroup, g.kind)) sectionGroupIds.add(g.id);
  const inSection = (compId: string): boolean => {
    const grp = componentsById.get(compId)?.group;
    return grp ? sectionGroupIds.has(grp) : false;
  };
  const folds = new Map<string, FoldSink>();
  const suppressed = new Set<string>();
  const foldedConnIds = new Set<string>();
  {
    interface FoldEdge { id: string; secId: string; ownerId: string; bucket: FoldBucket }
    const foldEdges: FoldEdge[] = [];
    const connCount = new Map<string, number>(); // total connections touching a component
    const secondaryCount = new Map<string, number>(); // folds where the component is the secondary
    for (const cn of model.connections ?? []) {
      const a = componentsById.get(cn.from);
      const b = componentsById.get(cn.to);
      if (a) connCount.set(a.id, (connCount.get(a.id) ?? 0) + 1);
      if (b) connCount.set(b.id, (connCount.get(b.id) ?? 0) + 1);
      if (!a || !b) {
        // Exactly one endpoint is a component, the other a group → a group fold (NACL→subnet):
        // a security control folds onto the group as a 🛡 chip. Other component↔group edges stay lines.
        const comp = a ?? b;
        const grpId = a ? cn.to : cn.from;
        if (comp && groupIds.has(grpId) && !inSection(comp.id)) {
          const gbkt = groupFoldBucket(comp.type);
          if (gbkt) {
            foldEdges.push({ id: cn.id, secId: comp.id, ownerId: grpId, bucket: gbkt });
            secondaryCount.set(comp.id, (secondaryCount.get(comp.id) ?? 0) + 1);
          }
        }
        continue;
      }
      const bkt = foldBucket(classifyRelationship(a.type, b.type, cn.kind));
      if (!bkt) continue; // communicates_with → stays an edge
      const side = secondarySide(a.type, b.type, classifyRelationship(a.type, b.type, cn.kind));
      if (!side) continue;
      const secId = side === 'from' ? cn.from : cn.to;
      const ownerId = side === 'from' ? cn.to : cn.from;
      if (inSection(secId) || inSection(ownerId)) continue; // section rows can't carry/show folds
      foldEdges.push({ id: cn.id, secId, ownerId, bucket: bkt });
      secondaryCount.set(secId, (secondaryCount.get(secId) ?? 0) + 1);
    }
    // Suppress a secondary only when *every* connection it has is a fold with it as the
    // secondary — i.e. it is purely an attachment/control/principal (EBS, SG, IAM role),
    // never also an owner or a communication endpoint (else keep its node + draw the line).
    for (const fe of foldEdges) {
      if (secondaryCount.get(fe.secId) !== connCount.get(fe.secId)) continue;
      const sec = componentsById.get(fe.secId)!;
      suppressed.add(fe.secId);
      foldedConnIds.add(fe.id);
      let sink = folds.get(fe.ownerId);
      if (!sink) { sink = { attachments: [], security: [], identity: [] }; folds.set(fe.ownerId, sink); }
      sink[fe.bucket].push({ id: sec.id, name: sec.name, type: sec.type, service: sec.binding?.service });
    }
  }

  // ---- Network-link folding (Day 73) ---------------------------------------------------
  // A peering / TGW / VPN / Direct-Connect component that joins exactly two network groups
  // (VPCs) folds into a single labeled connector between them — the link box disappears, the
  // relationship reads as `VPC A ◄══ peered ══► VPC B`. Links joining >2 groups stay a hub node.
  const linkEdges: ProjectedEdge[] = [];
  for (const lc of (model.components ?? []).filter((c) => isNetworkLink(c.type) && !suppressed.has(c.id))) {
    const conns = (model.connections ?? []).filter((cn) => cn.from === lc.id || cn.to === lc.id);
    const groupTargets = conns.map((cn) => (cn.from === lc.id ? cn.to : cn.from)).filter((id) => groupIds.has(id));
    if (groupTargets.length === 2 && conns.length === groupTargets.length) {
      suppressed.add(lc.id);
      for (const cn of conns) foldedConnIds.add(cn.id);
      linkEdges.push({
        id: `__link-${lc.id}`,
        source: groupTargets[0]!,
        target: groupTargets[1]!,
        label: linkLabel(lc.type),
        data: { kind: 'peering' },
        style: edgeStyle('peering'),
        bidirectional: true,
      });
    }
  }

  const ownerHeight = (id: string): number => {
    const f = folds.get(id);
    if (!f) return NODE_H;
    return NODE_H + f.attachments.length * FOLD.compartmentH + (f.security.length + f.identity.length > 0 ? FOLD.badgeRowH : 0);
  };

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
      const rows = section ? (componentsByGroup.get(g.id) ?? []).filter((c) => !suppressed.has(c.id)) : [];
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
          ...(folds.get(g.id) ? { security: folds.get(g.id)!.security } : {}),
          ...(g.kind === 'subnet'
            ? { public: g.properties?.public === true, role: subnetRole(g.properties?.role, (componentsByGroup.get(g.id) ?? []).map((c) => c.type)) }
            : {}),
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
      if (suppressed.has(c.id)) continue; // folded into an owner node
      y += GAP;
      const h = ownerHeight(c.id);
      const f = folds.get(c.id);
      nodes.push({
        id: c.id,
        type: 'service',
        parentId,
        extent: parentId ? 'parent' : undefined,
        position: { x: startX, y },
        data: {
          name: c.name,
          type: c.type,
          service: c.binding?.service,
          provider: c.binding?.provider,
          ...(f ? { attachments: f.attachments, security: f.security, identity: f.identity } : {}),
        },
        style: { width: NODE_W, height: h },
      });
      y += h;
      maxRight = Math.max(maxRight, startX + NODE_W);
    }

    return {
      width: Math.max(maxRight + (parentId ? PAD : 0), NODE_W + 2 * PAD),
      height: y + (parentId ? PAD : 0),
    };
  }

  layoutContainer(undefined);

  // Flow origin (Day 63): synthesize one "Internet / Users" node when the model has
  // internet-facing entry points, so the architecture reads from a clear start. The node
  // and its edges are projection-only — never persisted to the CAML model.
  const entryTargets = (model.components ?? []).filter((c) => isEntryPoint(c) && !suppressed.has(c.id));
  if (entryTargets.length > 0) {
    nodes.push({ id: ENTRY_ID, type: 'entry', position: { x: -240, y: 40 }, data: { label: 'Internet' }, style: { width: NODE_W, height: NODE_H } });
  }

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
    if (foldedConnIds.has(c.id)) continue; // attach/secure/assume — folded into a node, no line
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

  // Internet → each entry point (projection-only traffic edges from the origin node).
  for (const t of entryTargets) {
    edges.push({ id: `__entry-${t.id}`, source: ENTRY_ID, target: rowifiedToGroup.get(t.id) ?? t.id, label: 'https', data: { kind: 'traffic' }, style: edgeStyle('traffic') });
  }
  // Folded network-link connectors between VPCs (Day 73).
  edges.push(...linkEdges);

  return { nodes, edges };
}

/** Absolute position of every node, resolving parent-relative coords up the parentId chain. */
function absolutePositions(nodes: ProjectedNode[]): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const abs = new Map<string, { x: number; y: number }>();
  const resolve = (n: ProjectedNode): { x: number; y: number } => {
    const cached = abs.get(n.id);
    if (cached) return cached;
    let pos = { x: n.position.x, y: n.position.y };
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) {
      const pa = resolve(parent);
      pos = { x: pa.x + pos.x, y: pa.y + pos.y };
    }
    abs.set(n.id, pos);
    return pos;
  };
  for (const n of nodes) resolve(n);
  return abs;
}

/**
 * Composed projection (Day 70): take the nested projection's good positions and re-render
 * containment as **backdrops** — leaf nodes go flat (absolute coords, no parentId) and the
 * structural region/VPC/AZ/subnet boxes are replaced by `computeBackdrops` rectangles behind
 * the nodes. Tier "section panels" (groups with `items`) are kept as-is. This delivers the
 * backdrop look on the existing layout; flat-ELK flow-rank decoupling is a flagged follow-up.
 */
export function composeProjection(projection: Projection, model: ProjectableModel): Projection {
  const abs = absolutePositions(projection.nodes);
  const leafPositions = new Map<string, Rect>();
  for (const n of projection.nodes) {
    if (n.type === 'service' || n.type === 'entry') {
      const p = abs.get(n.id)!;
      leafPositions.set(n.id, { x: p.x, y: p.y, width: n.style?.width ?? NODE_W, height: n.style?.height ?? NODE_H });
    }
  }
  const backdrops = computeBackdrops(model, leafPositions);

  const flat: ProjectedNode[] = [];
  for (const n of projection.nodes) {
    const p = abs.get(n.id)!;
    if (n.type === 'group') {
      const items = (n.data as { items?: unknown[] }).items;
      // Keep section panels (they render their own rows); structural containers → backdrops.
      if (Array.isArray(items) && items.length > 0) flat.push({ ...n, position: p, parentId: undefined, extent: undefined });
      continue;
    }
    flat.push({ ...n, position: p, parentId: undefined, extent: undefined });
  }
  return { nodes: [...backdrops, ...flat], edges: projection.edges };
}
