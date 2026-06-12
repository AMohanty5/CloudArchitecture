import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CamlDocument } from '../generated/caml-types.js';
import { hashModel } from '../canonical/hash.js';
import { diffModels } from '../diff/diff.js';
import { applyDiff } from './apply-diff.js';
import { PatchError } from './patch.js';

const loadFixture = (rel: string): CamlDocument =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/${rel}`, import.meta.url)), 'utf8'));

const base = (): CamlDocument => ({
  camlVersion: '1.0',
  id: 'arch_1',
  name: 'Base',
  components: [
    { id: 'c0', type: 'compute.vm', name: 'VM', properties: { size: 'small' } },
    { id: 'c1', type: 'database.relational', name: 'DB' },
  ],
  connections: [{ id: 'e0', from: 'c0', to: 'c1', kind: 'data' }],
});

describe('applyDiff', () => {
  it('reconstructs the e-commerce fixture across an unrelated target', () => {
    const a = loadFixture('valid/02-ecommerce.json');
    const b = loadFixture('valid/03-serverless-api.json');
    expect(hashModel(applyDiff(a, diffModels(a, b)))).toBe(hashModel(b));
  });

  it('drops an optional collection that becomes empty (matches absent-when-empty)', () => {
    const a = base();
    const b: CamlDocument = { ...base(), connections: undefined };
    delete (b as { connections?: unknown }).connections;
    const rebuilt = applyDiff(a, diffModels(a, b));
    expect(rebuilt).not.toHaveProperty('connections');
    expect(hashModel(rebuilt)).toBe(hashModel(b));
  });

  it('applies adds, removes, modifies, and document-level changes together', () => {
    const a = base();
    const b: CamlDocument = {
      camlVersion: '1.0',
      id: 'arch_1',
      name: 'Renamed',
      description: 'now with a description',
      components: [
        { id: 'c0', type: 'compute.vm', name: 'VM', properties: { size: 'large' } }, // modified
        { id: 'c2', type: 'storage.object', name: 'Bucket' }, // added; c1 removed
      ],
      connections: [{ id: 'e0', from: 'c0', to: 'c2', kind: 'data' }], // modified endpoint
    };
    expect(hashModel(applyDiff(a, diffModels(a, b)))).toBe(hashModel(b));
  });

  it('throws if the diff modifies an element missing from the base', () => {
    const diff = diffModels(base(), base());
    diff.components.modified.push({ id: 'ghost', changes: [{ path: 'name', after: 'X' }] });
    expect(() => applyDiff(base(), diff)).toThrow(PatchError);
  });
});
