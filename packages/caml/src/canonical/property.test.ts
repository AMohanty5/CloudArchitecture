import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CamlDocument } from '../generated/caml-types.js';
import { arbDoc, arbMutation, deepShuffle, mulberry32, mutate } from '../testing/arbs.js';
import { hashModel } from './hash.js';

describe('hash invariance properties', () => {
  it('is invariant under key order and id-bearing array order (300 runs)', () => {
    fc.assert(
      fc.property(arbDoc, fc.integer(), (doc, seed) => {
        const shuffled = deepShuffle(doc, mulberry32(seed)) as CamlDocument;
        expect(hashModel(shuffled)).toBe(hashModel(doc));
      }),
      { numRuns: 300 },
    );
  });

  it('is invariant under annotation changes (200 runs)', () => {
    fc.assert(
      fc.property(arbDoc, fc.string({ maxLength: 30 }), (doc, noise) => {
        const without = structuredClone(doc);
        delete without.annotations;
        const withNoise = {
          ...structuredClone(doc),
          annotations: [{ target: 'c0', kind: 'review' as const, body: `noise: ${noise}` }],
        };
        expect(hashModel(without)).toBe(hashModel(doc));
        expect(hashModel(withNoise)).toBe(hashModel(doc));
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and stable across JSON round-trips (200 runs)', () => {
    fc.assert(
      fc.property(arbDoc, (doc) => {
        const roundTripped = JSON.parse(JSON.stringify(doc)) as CamlDocument;
        expect(hashModel(doc)).toBe(hashModel(doc));
        expect(hashModel(roundTripped)).toBe(hashModel(doc));
      }),
      { numRuns: 200 },
    );
  });
});

describe('hash sensitivity properties', () => {
  it('changes on every semantic mutation (300 runs)', () => {
    fc.assert(
      fc.property(arbDoc, arbMutation, (doc, kind) => {
        expect(hashModel(mutate(doc, kind))).not.toBe(hashModel(doc));
      }),
      { numRuns: 300 },
    );
  });
});
