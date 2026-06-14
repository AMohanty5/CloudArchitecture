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

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.spacing.nodeNode': '40',
};
// Group padding leaves room for the kind-styled header (top) + a margin all round.
const GROUP_OPTIONS: Record<string, string> = { 'elk.padding': '[top=36,left=18,bottom=18,right=18]' };

/** Build a hierarchical ELK graph from the projected nodes (parentId nesting) + edges. */
export function toElkGraph(nodes: ProjectedNode[], edges: ProjectedEdge[]): ElkNode {
  const elkById = new Map<string, ElkNode>();
  for (const n of nodes) {
    elkById.set(n.id, {
      id: n.id,
      width: n.style?.width,
      height: n.style?.height,
      ...(n.type === 'group' ? { layoutOptions: GROUP_OPTIONS, children: [] } : {}),
    });
  }

  const roots: ElkNode[] = [];
  for (const n of nodes) {
    const elk = elkById.get(n.id)!;
    const parent = n.parentId ? elkById.get(n.parentId) : undefined;
    if (parent?.children) parent.children.push(elk);
    else roots.push(elk);
  }

  return {
    id: 'root',
    layoutOptions: ROOT_OPTIONS,
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
export function autoLayout(nodes: ProjectedNode[], edges: ProjectedEdge[]): Promise<LayoutSidecar> {
  const graph = toElkGraph(nodes, edges);
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
