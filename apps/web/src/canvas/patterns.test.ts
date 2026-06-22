import { describe, expect, it } from 'vitest';
import { PATTERNS, PATTERNS_BY_ID } from './patterns';

describe('pattern library', () => {
  it('exposes the curated patterns by id', () => {
    expect([...PATTERNS_BY_ID.keys()].sort()).toEqual(['alarm-fanout', 'assume-role', 'event-fanout', 'event-to-store']);
  });

  it('every fragment connection references a component in the same fragment', () => {
    // remapFragment drops refs that point outside the fragment, so a typo would silently
    // discard a connection on insert — assert wiring is self-contained.
    for (const p of PATTERNS) {
      const ids = new Set(p.fragment.components.map((c) => c.id));
      for (const cn of p.fragment.connections) {
        expect(ids, `${p.id}: ${cn.id}.from`).toContain(cn.from);
        expect(ids, `${p.id}: ${cn.id}.to`).toContain(cn.to);
      }
    }
  });

  it('every component has a binding and a unique id within its fragment', () => {
    for (const p of PATTERNS) {
      const ids = p.fragment.components.map((c) => c.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
      for (const c of p.fragment.components) expect(c.binding?.service, `${p.id}:${c.id}`).toBeTruthy();
    }
  });
});
