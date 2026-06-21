import { describe, expect, it } from 'vitest';
import { project } from './projector';
import type { ProjectableModel, ProjectedNode } from './projector';
import { applyView } from './views';
import type { ArchView } from './views';
import { TEMPLATES } from './templates';

/**
 * Day 78 — Phase 2C composition golden review (projection level). For every shipped
 * template it checks the new composition machinery holds: in compose mode each backdrop
 * encloses its members (cohesion), the layers view bands every component, and each
 * architecture view yields a model with no dangling connections.
 * (Max-edge-length needs a live ELK layout — eyeballed on deploy, not asserted in CI.)
 */

interface Rect { x: number; y: number; width: number; height: number }
const rect = (n: ProjectedNode): Rect => ({ x: n.position.x, y: n.position.y, width: n.style!.width, height: n.style!.height });
const encloses = (o: Rect, i: Rect): boolean => o.x <= i.x && o.y <= i.y && o.x + o.width >= i.x + i.width && o.y + o.height >= i.y + i.height;

/** Component ids anywhere under a group (recursive). */
function descendantComponents(model: ProjectableModel, groupId: string): Set<string> {
  const childGroups = new Map<string, string[]>();
  for (const g of model.groups ?? []) if (g.parent) (childGroups.get(g.parent) ?? childGroups.set(g.parent, []).get(g.parent)!).push(g.id);
  const directComps = new Map<string, string[]>();
  for (const c of model.components ?? []) if (c.group) (directComps.get(c.group) ?? directComps.set(c.group, []).get(c.group)!).push(c.id);
  const collect = (gid: string, seen = new Set<string>()): string[] => {
    if (seen.has(gid)) return [];
    seen.add(gid);
    return [...(directComps.get(gid) ?? []), ...(childGroups.get(gid) ?? []).flatMap((c) => collect(c, seen))];
  };
  return new Set(collect(groupId));
}

describe('Phase 2C composition golden', () => {
  for (const t of TEMPLATES) {
    describe(t.label, () => {
      it('compose: every backdrop encloses its member nodes (cohesion)', () => {
        const { nodes } = project(t.model, undefined, { compose: true });
        const services = new Map(nodes.filter((n) => n.type === 'service').map((n) => [n.id, n]));
        const backdrops = nodes.filter((n) => n.type === 'group' && (n.data as { backdrop?: boolean }).backdrop);
        for (const b of backdrops) {
          for (const id of descendantComponents(t.model, b.id)) {
            const s = services.get(id);
            if (s) expect(encloses(rect(b), rect(s))).toBe(true);
          }
        }
      });

      it('layers: every component is banded and edges stay within banded nodes', () => {
        const { nodes, edges } = project(t.model, undefined, { layers: true });
        const banded = new Set(nodes.filter((n) => n.type === 'service').map((n) => n.id));
        for (const c of t.model.components) expect(banded.has(c.id)).toBe(true);
        for (const e of edges) {
          expect(banded.has(e.source)).toBe(true);
          expect(banded.has(e.target)).toBe(true);
        }
      });

      it('views: architecture / network / executive have no dangling connections', () => {
        for (const v of ['architecture', 'network', 'executive'] as ArchView[]) {
          const m = applyView(t.model, v);
          const ids = new Set((m.components ?? []).map((c) => c.id));
          for (const cn of m.connections ?? []) {
            expect(ids.has(cn.from)).toBe(true);
            expect(ids.has(cn.to)).toBe(true);
          }
        }
      });
    });
  }
});
