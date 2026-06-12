import { describe, expect, it } from 'vitest';
import type { CamlDocument } from '../generated/caml-types.js';
import { hashModel } from '../canonical/hash.js';
import { applyModelPatch, applyPatch, invertPatch, PatchError } from './patch.js';
import type { JsonPatch } from './patch.js';

const ecommerce = () =>
  structuredClone({
    a: 1,
    b: { c: 2, d: [10, 20, 30] },
    list: [{ id: 'x', n: 1 }],
  });

describe('applyPatch — RFC 6902 ops', () => {
  it('add: new object member, replace existing member, append/insert into array, root replace', () => {
    expect(applyPatch(ecommerce(), [{ op: 'add', path: '/e', value: 9 }])).toMatchObject({ e: 9 });
    expect(applyPatch(ecommerce(), [{ op: 'add', path: '/a', value: 5 }])).toMatchObject({ a: 5 });
    expect(applyPatch<{ b: { d: number[] } }>(ecommerce(), [{ op: 'add', path: '/b/d/-', value: 40 }]).b.d).toEqual([10, 20, 30, 40]);
    expect(applyPatch<{ b: { d: number[] } }>(ecommerce(), [{ op: 'add', path: '/b/d/1', value: 15 }]).b.d).toEqual([10, 15, 20, 30]);
    expect(applyPatch(ecommerce(), [{ op: 'add', path: '', value: { fresh: true } }])).toEqual({ fresh: true });
  });

  it('remove: object member and array element', () => {
    expect(applyPatch(ecommerce(), [{ op: 'remove', path: '/a' }])).not.toHaveProperty('a');
    expect(applyPatch<{ b: { d: number[] } }>(ecommerce(), [{ op: 'remove', path: '/b/d/0' }]).b.d).toEqual([20, 30]);
  });

  it('replace: member, array element, and root', () => {
    expect(applyPatch(ecommerce(), [{ op: 'replace', path: '/a', value: 99 }])).toMatchObject({ a: 99 });
    expect(applyPatch<{ b: { d: number[] } }>(ecommerce(), [{ op: 'replace', path: '/b/d/2', value: 0 }]).b.d).toEqual([10, 20, 0]);
    expect(applyPatch(ecommerce(), [{ op: 'replace', path: '', value: 42 }])).toBe(42);
  });

  it('move and copy', () => {
    expect(applyPatch(ecommerce(), [{ op: 'move', from: '/a', path: '/moved' }])).toEqual(
      expect.objectContaining({ moved: 1 }),
    );
    expect(applyPatch(ecommerce(), [{ op: 'move', from: '/a', path: '/moved' }])).not.toHaveProperty('a');
    const copied = applyPatch<{ a: number; dup: number }>(ecommerce(), [{ op: 'copy', from: '/a', path: '/dup' }]);
    expect(copied).toMatchObject({ a: 1, dup: 1 });
  });

  it('test passes on canonical equality and fails otherwise', () => {
    expect(() => applyPatch(ecommerce(), [{ op: 'test', path: '/b', value: { d: [10, 20, 30], c: 2 } }])).not.toThrow();
    expect(() => applyPatch(ecommerce(), [{ op: 'test', path: '/a', value: 2 }])).toThrow(PatchError);
  });

  it('does not mutate the input document', () => {
    const original = ecommerce();
    const snapshot = JSON.stringify(original);
    applyPatch(original, [{ op: 'remove', path: '/a' }, { op: 'add', path: '/z', value: 1 }]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('applyPatch — error paths', () => {
  it('rejects malformed pointers and indices', () => {
    expect(() => applyPatch(ecommerce(), [{ op: 'add', path: 'no-slash', value: 1 }])).toThrow(/invalid JSON pointer/);
    expect(() => applyPatch(ecommerce(), [{ op: 'add', path: '/b/d/x', value: 1 }])).toThrow(/invalid array index/);
    expect(() => applyPatch(ecommerce(), [{ op: 'add', path: '/b/d/9', value: 1 }])).toThrow(/out of bounds/);
  });

  it('rejects unresolvable paths', () => {
    expect(() => applyPatch(ecommerce(), [{ op: 'remove', path: '/nope' }])).toThrow(/path not found/);
    expect(() => applyPatch(ecommerce(), [{ op: 'replace', path: '/nope', value: 1 }])).toThrow(/does not exist/);
    expect(() => applyPatch(ecommerce(), [{ op: 'remove', path: '/b/d/9' }])).toThrow(/index out of range/);
    expect(() => applyPatch(ecommerce(), [{ op: 'remove', path: '' }])).toThrow(/document root/);
  });

  it('rejects moving a location into its own child and unknown ops', () => {
    expect(() => applyPatch(ecommerce(), [{ op: 'move', from: '/b', path: '/b/c' }])).toThrow(/own child/);
    expect(() => applyPatch(ecommerce(), [{ op: 'frobnicate', path: '/a' } as unknown as JsonPatch[number]])).toThrow(/unknown op/);
  });

  // doc shape: a scalar, an array, a nested object — for traversal error branches.
  const deep = () => ({ a: 1, arr: [{ id: 'x', n: 1 }], obj: { nested: 5 } });

  it('rejects traversal through missing / out-of-range / non-container intermediates', () => {
    expect(() => applyPatch(deep(), [{ op: 'add', path: '/missing/b', value: 1 }])).toThrow(/path not found/);
    expect(() => applyPatch(deep(), [{ op: 'add', path: '/arr/5/x', value: 1 }])).toThrow(/index out of range/);
    expect(() => applyPatch(deep(), [{ op: 'add', path: '/a/b/c', value: 1 }])).toThrow(/traverses a non-container/);
  });

  it('rejects writes into non-container targets', () => {
    expect(() => applyPatch(deep(), [{ op: 'add', path: '/a/b', value: 1 }])).toThrow(/cannot add to a non-container/);
    expect(() => applyPatch(deep(), [{ op: 'remove', path: '/a/b' }])).toThrow(/cannot remove from a non-container/);
    expect(() => applyPatch(deep(), [{ op: 'replace', path: '/a/b', value: 1 }])).toThrow(/cannot replace in a non-container/);
    expect(() => applyPatch(deep(), [{ op: 'replace', path: '/arr/9', value: 1 }])).toThrow(/cannot replace \(index out of range\)/);
    expect(() => applyPatch(deep(), [{ op: 'remove', path: '/arr/x' }])).toThrow(/invalid array index/);
  });

  it('rejects copy/test from unresolvable sources', () => {
    expect(() => applyPatch(deep(), [{ op: 'copy', from: '/zzz', path: '/p' }])).toThrow(/path not found/);
    expect(() => applyPatch(deep(), [{ op: 'copy', from: '/arr/9', path: '/p' }])).toThrow(/index out of range/);
    expect(() => applyPatch(deep(), [{ op: 'test', path: '/a/x', value: 1 }])).toThrow(/path not found/);
  });
});

describe('invertPatch', () => {
  const cases: { name: string; patch: JsonPatch }[] = [
    { name: 'add member', patch: [{ op: 'add', path: '/e', value: 9 }] },
    { name: 'add over existing (replace semantics)', patch: [{ op: 'add', path: '/a', value: 5 }] },
    { name: 'array append', patch: [{ op: 'add', path: '/b/d/-', value: 40 }] },
    { name: 'array insert', patch: [{ op: 'add', path: '/b/d/1', value: 15 }] },
    { name: 'remove member', patch: [{ op: 'remove', path: '/a' }] },
    { name: 'remove array element', patch: [{ op: 'remove', path: '/b/d/0' }] },
    { name: 'replace member', patch: [{ op: 'replace', path: '/a', value: 99 }] },
    { name: 'replace root', patch: [{ op: 'replace', path: '', value: { only: 'this' } }] },
    { name: 'add (replace) root', patch: [{ op: 'add', path: '', value: { fresh: true } }] },
    { name: 'move', patch: [{ op: 'move', from: '/a', path: '/moved' }] },
    { name: 'copy', patch: [{ op: 'copy', from: '/a', path: '/dup' }] },
    { name: 'multi-op', patch: [{ op: 'remove', path: '/a' }, { op: 'add', path: '/b/d/-', value: 40 }, { op: 'replace', path: '/b/c', value: 7 }] },
  ];

  for (const { name, patch } of cases) {
    it(`round-trips: ${name}`, () => {
      const doc = ecommerce();
      const forward = applyPatch(doc, patch);
      const restored = applyPatch(forward, invertPatch(doc, patch));
      expect(restored).toEqual(doc);
    });
  }

  it('test ops contribute nothing to the inverse', () => {
    const doc = ecommerce();
    const inverse = invertPatch(doc, [{ op: 'test', path: '/a', value: 1 }, { op: 'replace', path: '/a', value: 2 }]);
    expect(inverse).toEqual([{ op: 'replace', path: '/a', value: 1 }]);
  });

  it('refuses to invert a move that overwrites an existing member', () => {
    const doc = { a: 1, b: 2 };
    expect(() => invertPatch(doc, [{ op: 'move', from: '/a', path: '/b' }])).toThrow(/overwrites an existing member/);
  });
});

describe('applyModelPatch — CAML-aware', () => {
  const base = (): CamlDocument => ({
    camlVersion: '1.0',
    id: 'arch_TESTBASE0',
    name: 'Base',
    components: [{ id: 'c0', type: 'compute.vm', name: 'VM' }],
  });

  it('returns the new model when the patch keeps it valid', () => {
    const next = applyModelPatch(base(), [
      { op: 'add', path: '/components/-', value: { id: 'c1', type: 'storage.object', name: 'Bucket' } },
    ]);
    expect(next.components).toHaveLength(2);
    expect(hashModel(next)).not.toBe(hashModel(base()));
  });

  it('throws with structured errors when the patch breaks validity (duplicate id)', () => {
    try {
      applyModelPatch(base(), [{ op: 'add', path: '/components/-', value: { id: 'c0', type: 'storage.object', name: 'Dup' } }]);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PatchError);
      expect((err as PatchError).errors?.[0]?.code).toBe('duplicate-id');
    }
  });
});
