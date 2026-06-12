import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashModel } from '../canonical/hash.js';
import { diffModels, diffIsEmpty } from '../diff/diff.js';
import { arbDoc, arbMutation, mutate } from '../testing/arbs.js';
import { applyDiff } from './apply-diff.js';

describe('applyDiff round-trip', () => {
  it('applyDiff(a, diff(a, b)) ≡ b for arbitrary pairs (1000 runs)', () => {
    fc.assert(
      fc.property(arbDoc, arbDoc, (a, b) => {
        const rebuilt = applyDiff(a, diffModels(a, b));
        expect(hashModel(rebuilt)).toBe(hashModel(b));
      }),
      { numRuns: 1000 },
    );
  });

  it('applyDiff over single semantic mutations reproduces the mutant (500 runs)', () => {
    fc.assert(
      fc.property(arbDoc, arbMutation, (a, kind) => {
        const b = mutate(a, kind);
        const rebuilt = applyDiff(a, diffModels(a, b));
        expect(hashModel(rebuilt)).toBe(hashModel(b));
      }),
      { numRuns: 500 },
    );
  });

  it('applyDiff(a, diff(a, a)) is a no-op (200 runs)', () => {
    fc.assert(
      fc.property(arbDoc, (a) => {
        const diff = diffModels(a, a);
        expect(diffIsEmpty(diff)).toBe(true);
        expect(hashModel(applyDiff(a, diff))).toBe(hashModel(a));
      }),
      { numRuns: 200 },
    );
  });
});
