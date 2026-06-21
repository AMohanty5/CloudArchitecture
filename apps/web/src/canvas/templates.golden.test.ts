import { describe, expect, it } from 'vitest';
import { project } from './projector';
import type { ProjectedNode } from './projector';
import { TEMPLATES } from './templates';

/**
 * Day 66 — golden review at the projection level (pixel goldens need a browser). Renders
 * every shipped template through the Phase-2 projector and asserts the invariants the
 * redesign relies on: no dangling edges after folding/entry injection, the React Flow
 * nesting order, and — the check that caught the section-panel ⨯ folding bug — that *every*
 * component is still represented somewhere (a node, a section row, or a fold badge).
 */

/** Component ids that appear on screen: as a service node, a section row, or a folded badge. */
function representedIds(nodes: ProjectedNode[]): Set<string> {
  const s = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'service') s.add(n.id);
    const d = n.data as { items?: { id: string }[]; attachments?: { id: string }[]; security?: { id: string }[]; identity?: { id: string }[] };
    for (const it of d.items ?? []) s.add(it.id);
    for (const arr of [d.attachments, d.security, d.identity]) for (const it of arr ?? []) s.add(it.id);
  }
  return s;
}

describe('template golden — Phase-2 projection integrity', () => {
  for (const t of TEMPLATES) {
    describe(t.label, () => {
      const { nodes, edges } = project(t.model);
      const nodeIds = new Set(nodes.map((n) => n.id));

      it('every edge connects two emitted nodes (no dangling after folding/entry)', () => {
        for (const e of edges) {
          expect(nodeIds.has(e.source)).toBe(true);
          expect(nodeIds.has(e.target)).toBe(true);
        }
      });

      it('children appear after their parent (React Flow nesting invariant)', () => {
        const index = new Map(nodes.map((n, i) => [n.id, i]));
        for (const n of nodes) if (n.parentId) expect(index.get(n.parentId)!).toBeLessThan(index.get(n.id)!);
      });

      it('every component is represented (node / section row / fold badge — nothing vanishes)', () => {
        const represented = representedIds(nodes);
        for (const c of t.model.components) expect(represented.has(c.id)).toBe(true);
      });
    });
  }
});

describe('template golden — flow + folding specifics', () => {
  const byKey = (k: string) => TEMPLATES.find((t) => t.key === k)!;

  it('3-tier gets an Internet entry node (internet-facing ALB)', () => {
    expect(project(byKey('three-tier').model).nodes.some((n) => n.type === 'entry')).toBe(true);
  });

  it('layered-platform keeps its security components as section rows (folding skipped in panels)', () => {
    const { nodes } = project(byKey('layered-platform').model);
    const sec = nodes.find((n) => n.id === 'tier-security');
    const ids = ((sec!.data as { items?: { id: string }[] }).items ?? []).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['kms', 'secrets', 'iam']));
  });
});
