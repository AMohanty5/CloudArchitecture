import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateStructure } from '@cac/caml';
import type { CamlDocument } from '@cac/caml';
import { loadCatalog } from './loader.js';
import { validateAgainstCatalog } from './validate.js';

const catalogRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');
const catalog = loadCatalog(catalogRoot);

const example = (): CamlDocument =>
  JSON.parse(readFileSync(new URL('../fixtures/web-3tier.example.json', import.meta.url), 'utf8'));

describe('validateAgainstCatalog (pass 2)', () => {
  it('the doc-05-style example passes pass-1 (structural) and pass-2 (catalog)', () => {
    const doc = example();
    expect(validateStructure(doc).valid).toBe(true);
    const result = validateAgainstCatalog(doc, catalog);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a bogus instanceClass with a catalog-sourced message', () => {
    const doc = example();
    doc.components.find((c) => c.id === 'orders-db')!.properties!['instanceClass'] = 'huge';
    const result = validateAgainstCatalog(doc, catalog);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'catalog-property');
    expect(err).toBeDefined();
    expect(err!.message).toContain('aws.rds');
    expect(err!.message).toContain('instanceClass');
    expect(err!.path).toBe('components[2].properties.instanceClass');
  });

  it('flags an unknown bound service', () => {
    const doc = example();
    doc.components.find((c) => c.id === 'orders-db')!.binding!.service = 'aws.nonexistent';
    const result = validateAgainstCatalog(doc, catalog);
    expect(result.errors.some((e) => e.code === 'unknown-service')).toBe(true);
  });

  it('flags a type incompatible with the bound service', () => {
    const doc = example();
    doc.components.find((c) => c.id === 'orders-db')!.type = 'storage.object';
    const result = validateAgainstCatalog(doc, catalog);
    expect(result.errors.some((e) => e.code === 'type-mismatch')).toBe(true);
  });

  it('validates group properties against the group-kind service', () => {
    const doc = example();
    doc.groups!.find((g) => g.id === 'vpc-main')!.properties!['cidr'] = 'not-a-cidr';
    const result = validateAgainstCatalog(doc, catalog);
    const err = result.errors.find((e) => e.code === 'catalog-property');
    expect(err?.message).toContain('aws.vpc');
    expect(err?.path).toContain('groups');
  });

  it('skips abstract-only components (no binding)', () => {
    const doc: CamlDocument = {
      camlVersion: '1.0',
      id: 'arch_ABSTRACT0',
      name: 'abstract only',
      components: [{ id: 'svc', type: 'compute.vm', name: 'X', properties: { anything: 1 } }],
    };
    expect(validateAgainstCatalog(doc, catalog).valid).toBe(true);
  });
});
