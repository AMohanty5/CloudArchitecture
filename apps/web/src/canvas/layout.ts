import type { LayoutSidecar, ProjectedNode, ProjectedEdge } from './projector';

/**
 * ELK auto-layout (blueprint doc 06): projected nodes/edges → a hierarchical ELK
 * graph → a layout sidecar (positions + group sizes). The layered algorithm with
 * `INCLUDE_CHILDREN` + orthogonal routing gives the left-to-right traffic-flow look
 * with intact VPC ⊃ subnet ⊃ instance nesting. Layout runs in a Web Worker.
 */

/** Minimal ELK graph types (we only use the fields we set/read). */
interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: ElkEdge[];
}
interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

// Shared base — the layered algorithm with hierarchy + orthogonal routing and a
// dense, architecture-diagram feel. Each preset layers its own options on top.
const BASE_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  // More breathing room (whitespace over density, visual-redesign §1) + network-simplex
  // placement, which aligns nodes per layer so edges run straighter with fewer bends.
  'elk.layered.spacing.nodeNodeBetweenLayers': '56',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.spacing.edgeNode': '16',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.direction': 'RIGHT',
};

/** Selectable auto-layout strategies (Day 40). All layered-based so group nesting holds. */
export type LayoutStrategy = 'layered-lr' | 'layered-tb' | 'compact-lr' | 'tiered-tb' | 'flow-lr';

export const DEFAULT_STRATEGY: LayoutStrategy = 'layered-lr';

/** Preset label + the ELK options it overlays on BASE_OPTIONS. */
export const LAYOUT_PRESETS: Record<LayoutStrategy, { label: string; options: Record<string, string> }> = {
  'layered-lr': { label: 'Layered →', options: { 'elk.direction': 'RIGHT' } },
  'layered-tb': { label: 'Layered ↓', options: { 'elk.direction': 'DOWN' } },
  'compact-lr': {
    label: 'Compact →',
    options: { 'elk.direction': 'RIGHT', 'elk.layered.spacing.nodeNodeBetweenLayers': '28', 'elk.spacing.nodeNode': '12' },
  },
  'tiered-tb': {
    label: 'Tiered ↓',
    options: { 'elk.direction': 'DOWN', 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.spacing.nodeNodeBetweenLayers': '52' },
  },
  // Archetype flow (Day 64): partition nodes by tier so they read Internet → edge →
  // compute → data left-to-right. Best for flatter architectures (serverless, event-driven,
  // data pipeline); nested 3-tier still favours Layered →.
  'flow-lr': { label: 'Flow ⇢', options: { 'elk.direction': 'RIGHT', 'elk.partitioning.activate': 'true' } },
};

/**
 * Flow tier for the partition-ordered "Flow" layout: entry (0) → edge/networking (1) →
 * compute/messaging/other (2) → data/storage (3). Derived from the node's abstract type
 * (carried on `data.type` by the projector); the synthesized Internet node is tier 0.
 */
export function tierRank(node: ProjectedNode): number {
  if (node.type === 'entry') return 0;
  const t = String((node.data as { type?: string } | undefined)?.type ?? '');
  if (t.startsWith('network.cdn') || t.startsWith('network.dns') || t.startsWith('network.gateway') || t.startsWith('network.loadbalancer') || t.startsWith('network.firewall')) return 1;
  if (t.startsWith('database.') || t.startsWith('storage.')) return 3;
  return 2;
}

function rootOptions(strategy: LayoutStrategy): Record<string, string> {
  return { ...BASE_OPTIONS, ...LAYOUT_PRESETS[strategy].options };
}

// Group padding leaves room for the kind-styled header (top) + a tight margin all round.
const GROUP_OPTIONS: Record<string, string> = { 'elk.padding': '[top=32,left=14,bottom=14,right=14]' };

/** Build a hierarchical ELK graph from the projected nodes (parentId nesting) + edges. */
export function toElkGraph(nodes: ProjectedNode[], edges: ProjectedEdge[], strategy: LayoutStrategy = DEFAULT_STRATEGY): ElkNode {
  const partitioned = strategy === 'flow-lr';
  const elkById = new Map<string, ElkNode>();
  for (const n of nodes) {
    const layoutOptions: Record<string, string> = n.type === 'group' ? { ...GROUP_OPTIONS } : {};
    // Flow layout partitions leaf nodes by tier; groups keep their padding only.
    if (partitioned && n.type !== 'group') layoutOptions['elk.partitioning.partition'] = String(tierRank(n));
    elkById.set(n.id, {
      id: n.id,
      width: n.style?.width,
      height: n.style?.height,
      ...(n.type === 'group' ? { children: [] } : {}),
      ...(Object.keys(layoutOptions).length > 0 ? { layoutOptions } : {}),
    });
  }

  const roots: ElkNode[] = [];
  for (const n of nodes) {
    const elk = elkById.get(n.id)!;
    const parent = n.parentId ? elkById.get(n.parentId) : undefined;
    if (parent?.children) parent.children.push(elk);
    else roots.push(elk);
  }

  // A "group" with no child nodes (e.g. a Day-41 section panel whose components render
  // as rows) must be laid out as a fixed-size leaf, else ELK shrinks it to its padding.
  for (const elk of elkById.values()) {
    if (elk.children && elk.children.length === 0) {
      delete elk.children;
      delete elk.layoutOptions;
    }
  }

  return {
    id: 'root',
    layoutOptions: rootOptions(strategy),
    children: roots,
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

/** Walk a laid-out ELK graph into a layout sidecar: positions for all, sizes for groups. */
export function fromElkGraph(graph: ElkNode): LayoutSidecar {
  const positions: Record<string, { x: number; y: number }> = {};
  const sizes: Record<string, { width: number; height: number }> = {};

  const walk = (node: ElkNode): void => {
    for (const child of node.children ?? []) {
      positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
      if (child.children && child.children.length > 0 && child.width != null && child.height != null) {
        sizes[child.id] = { width: child.width, height: child.height };
      }
      walk(child);
    }
  };
  walk(graph);
  return { positions, sizes };
}

let worker: Worker | undefined;
function getWorker(): Worker {
  worker ??= new Worker(new URL('./elk.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Lay out the graph in the ELK Web Worker and resolve a layout sidecar. */
export function autoLayout(nodes: ProjectedNode[], edges: ProjectedEdge[], strategy: LayoutStrategy = DEFAULT_STRATEGY): Promise<LayoutSidecar> {
  const graph = toElkGraph(nodes, edges, strategy);
  return new Promise<LayoutSidecar>((resolve, reject) => {
    const w = getWorker();
    const onMessage = (ev: MessageEvent): void => {
      w.removeEventListener('message', onMessage);
      const data = ev.data as { ok: boolean; graph?: ElkNode; error?: string };
      if (data.ok && data.graph) resolve(fromElkGraph(data.graph));
      else reject(new Error(data.error ?? 'ELK layout failed'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage(graph);
  });
}
