import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalizeValue } from '../canonical/canonicalize.js';
import { arbDoc } from '../testing/arbs.js';
import { applyPatch, invertPatch } from './patch.js';
import type { JsonPatch } from './patch.js';

describe('invertPatch round-trip (property)', () => {
  it('applyPatch(applyPatch(doc, p), invert(doc, p)) ≡ doc (300 runs)', () => {
    fc.assert(
      fc.property(arbDoc, fc.string({ maxLength: 8 }), (doc, suffix) => {
        // A patch touching each op family, kept individually valid against the doc.
        const lastIdx = doc.components.length - 1;
        const patch: JsonPatch = [
          { op: 'replace', path: '/name', value: `${doc.name}-${suffix}` },
          { op: 'add', path: '/components/-', value: { id: 'pt-added', type: 'storage.object', name: 'Added' } },
          { op: 'replace', path: `/components/${lastIdx}/name`, value: `renamed-${suffix}` },
          { op: 'remove', path: '/components/0' },
        ];
        const forward = applyPatch(doc, patch);
        const restored = applyPatch(forward, invertPatch(doc, patch));
        expect(canonicalizeValue(restored)).toBe(canonicalizeValue(doc));
      }),
      { numRuns: 300 },
    );
  });
});
