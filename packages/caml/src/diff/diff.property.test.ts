import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashModel } from '../canonical/hash.js';
import type { CamlDocument } from '../generated/caml-types.js';
import { arbDoc, arbMutation, deepShuffle, mulberry32, mutate } from '../testing/arbs.js';
import { diffIsEmpty, diffModels } from './diff.js';

describe('diff properties', () => {
  it('diff(a, a) is empty (100 runs)', () => {
    fc.assert(
      fc.property(arbDoc, (doc) => {
        expect(diffIsEmpty(diffModels(doc, doc))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('diff is empty across formatting shuffles — and agrees with the hash (200 runs)', () => {
    fc.assert(
      fc.property(arbDoc, fc.integer(), (doc, seed) => {
        const shuffled = deepShuffle(doc, mulberry32(seed)) as CamlDocument;
        const diff = diffModels(doc, shuffled);
        expect(diffIsEmpty(diff)).toBe(true);
        expect(hashModel(doc)).toBe(hashModel(shuffled));
      }),
      { numRuns: 200 },
    );
  });

  it('every semantic mutation produces a non-empty diff — and agrees with the hash (200 runs)', () => {
    fc.assert(
      fc.property(arbDoc, arbMutation, (doc, kind) => {
        const mutated = mutate(doc, kind);
        const diff = diffModels(doc, mutated);
        expect(diffIsEmpty(diff)).toBe(false);
        expect(hashModel(doc)).not.toBe(hashModel(mutated));
      }),
      { numRuns: 200 },
    );
  });
});
