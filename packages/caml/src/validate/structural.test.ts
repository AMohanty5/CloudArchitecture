import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CamlErrorCode } from './errors.js';
import { validateStructure } from './structural.js';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');
const loadJson = (...segments: string[]): unknown =>
  JSON.parse(readFileSync(path.join(fixturesDir, ...segments), 'utf8'));

const validFiles = readdirSync(path.join(fixturesDir, 'valid')).filter((f) =>
  f.endsWith('.json'),
);
const invalidFiles = readdirSync(path.join(fixturesDir, 'invalid')).filter(
  (f) => f.endsWith('.json') && f !== 'expected.json',
);
const expected = loadJson('invalid', 'expected.json') as Record<
  string,
  { codes: CamlErrorCode[]; mentions?: string[] }
>;

describe('valid fixtures', () => {
  it('has the planned coverage (5 models)', () => {
    expect(validFiles).toHaveLength(5);
  });

  for (const file of validFiles) {
    it(`accepts ${file}`, () => {
      const result = validateStructure(loadJson('valid', file));
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe('invalid fixtures', () => {
  it('has the planned coverage (10 models) and a complete manifest', () => {
    expect(invalidFiles).toHaveLength(10);
    expect(Object.keys(expected).sort()).toEqual([...invalidFiles].sort());
  });

  for (const file of invalidFiles) {
    it(`rejects ${file} with the expected error`, () => {
      const result = validateStructure(loadJson('invalid', file));
      expect(result.valid).toBe(false);
      const spec = expected[file]!;
      for (const code of spec.codes) {
        expect(
          result.errors.some((e) => e.code === code),
          `expected an error with code "${code}", got: ${JSON.stringify(result.errors, null, 2)}`,
        ).toBe(true);
      }
      for (const mention of spec.mentions ?? []) {
        expect(
          result.errors.some((e) => e.message.includes(mention)),
          `expected some error message to mention "${mention}", got: ${result.errors
            .map((e) => e.message)
            .join(' | ')}`,
        ).toBe(true);
      }
    });
  }
});

describe('error ergonomics', () => {
  it('anchors schema errors to the offending element id', () => {
    const doc = loadJson('valid', '02-ecommerce.json') as {
      components: { id: string; binding?: { service: string } }[];
    };
    const apiLb = doc.components.find((c) => c.id === 'api-lb')!;
    apiLb.binding!.service = 'aws.ALB!';
    const result = validateStructure(doc);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.element).toBe('api-lb');
    expect(result.errors[0]!.message).toContain('component "api-lb"');
  });

  it('rejects non-object input without throwing', () => {
    for (const input of [null, 42, 'nope', [], undefined]) {
      const result = validateStructure(input);
      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('invalid-document');
    }
  });

  it('reports multiple independent errors in one pass', () => {
    const result = validateStructure({
      camlVersion: '1.0',
      id: 'arch_MULTIERR',
      name: 'multiple integrity errors',
      components: [
        { id: 'web', type: 'compute.vm', name: 'A', group: 'nowhere' },
        { id: 'web', type: 'compute.vm', name: 'B' },
      ],
      connections: [{ id: 'c1', from: 'web', to: 'ghost', kind: 'traffic' }],
    });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('duplicate-id');
    expect(codes).toContain('unresolved-ref');
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
