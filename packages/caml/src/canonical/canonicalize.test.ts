import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CamlDocument } from '../generated/caml-types.js';
import { canonicalize } from './canonicalize.js';
import { hashModel } from './hash.js';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');
const loadFixture = (name: string): CamlDocument =>
  JSON.parse(readFileSync(path.join(fixturesDir, 'valid', name), 'utf8')) as CamlDocument;

/** Rebuild an object tree with reversed key insertion order and reversed id-bearing arrays. */
function scramble(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(scramble);
    const idBearing = mapped.every(
      (v) => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string',
    );
    return idBearing && mapped.length > 0 ? mapped.reverse() : mapped;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).reverse()) out[k] = scramble(v);
    return out;
  }
  return value;
}

describe('canonicalize', () => {
  it('produces compact, key-sorted output', () => {
    expect(canonicalize(loadFixture('01-minimal.json'))).toBe(
      '{"camlVersion":"1.0","components":[],"id":"arch_MINIMAL0","name":"Minimal valid document"}',
    );
  });

  it('is invariant under key order and id-bearing array order', () => {
    const doc = loadFixture('02-ecommerce.json');
    const scrambled = scramble(doc) as CamlDocument;
    expect(JSON.stringify(scrambled)).not.toBe(JSON.stringify(doc)); // genuinely different formatting
    expect(canonicalize(scrambled)).toBe(canonicalize(doc));
  });

  it('excludes annotations from canonical form', () => {
    const doc = loadFixture('05-abstract-only.json');
    expect(doc.annotations?.length).toBeGreaterThan(0);
    const withoutAnnotations = { ...doc };
    delete withoutAnnotations.annotations;
    expect(canonicalize(doc)).toBe(canonicalize(withoutAnnotations));
  });

  it('preserves the order of non-id arrays (their order is semantic)', () => {
    const base = loadFixture('01-minimal.json');
    const a = { ...base, metadata: { tags: ['one', 'two'] } };
    const b = { ...base, metadata: { tags: ['two', 'one'] } };
    expect(canonicalize(a)).not.toBe(canonicalize(b));
  });

  it('rejects non-finite numbers', () => {
    const doc = loadFixture('01-minimal.json');
    const poisoned = {
      ...doc,
      components: [{ id: 'a', type: 'compute.vm', name: 'x', properties: { bad: NaN } }],
    } as unknown as CamlDocument;
    expect(() => canonicalize(poisoned)).toThrow(TypeError);
  });
});

describe('hashModel', () => {
  it('pins the golden hash of the e-commerce fixture (canonicalization regression guard)', () => {
    // If this fails after an intentional fixture or canonicalization-rule change,
    // re-pin it. If it fails otherwise, the canonical form regressed.
    expect(hashModel(loadFixture('02-ecommerce.json'))).toBe(
      'a9578705edcefe639fc113293a0c44a2e99bc82b765336fd6fb2a74ce17dd005',
    );
  });

  it('hashes scrambled and original documents identically', () => {
    const doc = loadFixture('02-ecommerce.json');
    expect(hashModel(scramble(doc) as CamlDocument)).toBe(hashModel(doc));
  });

  it('produces 64-char lowercase hex', () => {
    expect(hashModel(loadFixture('01-minimal.json'))).toMatch(/^[a-f0-9]{64}$/);
  });
});
