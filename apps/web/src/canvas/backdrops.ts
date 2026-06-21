import type { ProjectableModel, ProjectedNode } from './projector';

/**
 * Backdrop-layer engine (Day 69, docs/canvas-composition.md §1). The deep change that turns
 * region/VPC/AZ/subnet from ELK *parent containers* (which force nested layout + long
 * connectors) into **background regions computed from where their members actually land**.
 *
 * Pure + deterministic: given the absolute laid-out rectangles of the leaf resource nodes,
 * it returns one backdrop group node per container, sized to enclose all of its descendants
 * with padding that increases toward the root (so Region encloses VPC encloses AZ encloses
 * Subnet) and a negative z-index so backdrops sit behind the nodes.
 *
 * This module does NOT change the live render — Day 70 lays the graph out flat and feeds the
 * resulting absolute positions here, behind a flag, so it can be eyeballed before becoming
 * the default.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Innermost padding; each level toward the root adds `PAD_STEP` so outer encloses inner. */
const PAD_BASE = 16;
const PAD_STEP = 14;
/** Extra top space reserved for the corner label. */
const TITLE = 22;

function bucket<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Distance from the root of the group tree (region = 0, vpc = 1, subnet = 2…). */
function depthOf(groupId: string, parentOf: Map<string, string | undefined>): number {
  let depth = 0;
  let cur = parentOf.get(groupId);
  const seen = new Set<string>([groupId]);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = parentOf.get(cur);
  }
  return depth;
}

/**
 * Compute backdrop nodes for a model's groups from the absolute positions of its leaf nodes.
 * Groups with no laid-out members are skipped. Output is z-ordered behind the nodes.
 */
export function computeBackdrops(model: ProjectableModel, positions: Map<string, Rect>): ProjectedNode[] {
  const groups = model.groups ?? [];
  const parentOf = new Map<string, string | undefined>(groups.map((g) => [g.id, g.parent]));

  // Direct members.
  const directComponents = new Map<string, string[]>();
  for (const c of model.components ?? []) if (c.group) bucket(directComponents, c.group, c.id);
  const childGroups = new Map<string, string[]>();
  for (const g of groups) if (g.parent) bucket(childGroups, g.parent, g.id);

  // All component ids under a group (recursive, cycle-guarded).
  const collect = (gid: string, seen = new Set<string>()): string[] => {
    if (seen.has(gid)) return [];
    seen.add(gid);
    return [...(directComponents.get(gid) ?? []), ...(childGroups.get(gid) ?? []).flatMap((c) => collect(c, seen))];
  };

  const maxDepth = groups.reduce((m, g) => Math.max(m, depthOf(g.id, parentOf)), 0);

  const out: ProjectedNode[] = [];
  for (const g of groups) {
    const members = collect(g.id)
      .map((id) => positions.get(id))
      .filter((r): r is Rect => Boolean(r));
    if (members.length === 0) continue;

    const minX = Math.min(...members.map((m) => m.x));
    const minY = Math.min(...members.map((m) => m.y));
    const maxX = Math.max(...members.map((m) => m.x + m.width));
    const maxY = Math.max(...members.map((m) => m.y + m.height));

    const depth = depthOf(g.id, parentOf);
    const pad = PAD_BASE + (maxDepth - depth) * PAD_STEP; // outer containers get more padding

    out.push({
      id: g.id,
      type: 'group',
      position: { x: minX - pad, y: minY - pad - TITLE },
      data: {
        label: g.name,
        kind: g.kind,
        backdrop: true,
        ...(g.kind === 'subnet' ? { public: g.properties?.public === true } : {}),
      },
      style: { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 + TITLE },
      zIndex: -100 + depth * 10, // region (depth 0) furthest back; all behind nodes (≥0)
    });
  }
  return out;
}
