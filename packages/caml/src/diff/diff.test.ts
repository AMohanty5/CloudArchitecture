import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashModel } from '../canonical/hash.js';
import type { CamlDocument } from '../generated/caml-types.js';
import type { ModelDiff, ModifiedElement, PropertyChange } from './diff.js';
import { diffIsEmpty, diffModels } from './diff.js';
import { formatDiff } from './format.js';

const diffDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/diff');

interface ExpectedCollection {
  added?: string[];
  removed?: string[];
  modified?: ModifiedElement[];
}
interface DiffCase {
  before: CamlDocument;
  after: CamlDocument;
  expected: {
    components?: ExpectedCollection;
    connections?: ExpectedCollection;
    groups?: ExpectedCollection;
    policies?: ExpectedCollection;
    requirements?: ExpectedCollection;
    deployments?: ExpectedCollection;
    document?: PropertyChange[];
    mentions?: string[];
  };
}

const COLLECTIONS = [
  'components',
  'connections',
  'groups',
  'policies',
  'requirements',
  'deployments',
] as const;

/** Project a full ModelDiff onto the compact, id-based shape the fixtures assert. */
function project(diff: ModelDiff): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COLLECTIONS) {
    out[key] = {
      added: diff[key].added.map((e) => e.id),
      removed: diff[key].removed.map((e) => e.id),
      modified: diff[key].modified,
    };
  }
  out['document'] = diff.document;
  return out;
}

function normalize(expected: DiffCase['expected']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COLLECTIONS) {
    const section = expected[key] ?? {};
    out[key] = {
      added: section.added ?? [],
      removed: section.removed ?? [],
      modified: section.modified ?? [],
    };
  }
  out['document'] = expected.document ?? [];
  return out;
}

const caseFiles = readdirSync(diffDir).filter((f) => f.endsWith('.json'));

describe('diffModels fixture suite', () => {
  it('has the planned coverage (12 cases)', () => {
    expect(caseFiles).toHaveLength(12);
  });

  for (const file of caseFiles) {
    const testCase = JSON.parse(readFileSync(path.join(diffDir, file), 'utf8')) as DiffCase;

    it(`${file}: produces the expected typed change set`, () => {
      const diff = diffModels(testCase.before, testCase.after);
      expect(project(diff)).toEqual(normalize(testCase.expected));
    });

    it(`${file}: summary contains the expected lines`, () => {
      const summary = formatDiff(diffModels(testCase.before, testCase.after));
      for (const mention of testCase.expected.mentions ?? []) {
        expect(summary, `summary was:\n${summary}`).toContain(mention);
      }
    });

    it(`${file}: empty-diff ⟺ equal-hash invariant holds`, () => {
      const diff = diffModels(testCase.before, testCase.after);
      expect(diffIsEmpty(diff)).toBe(hashModel(testCase.before) === hashModel(testCase.after));
    });
  }
});

describe('formatDiff', () => {
  it('renders "No changes." for an identical pair', () => {
    const doc: CamlDocument = {
      camlVersion: '1.0',
      id: 'arch_EMPTYDIFF',
      name: 'Same',
      components: [],
    };
    expect(formatDiff(diffModels(doc, doc))).toBe('No changes.');
  });

  it('truncates oversized values in the summary', () => {
    const before: CamlDocument = {
      camlVersion: '1.0',
      id: 'arch_TRUNC000',
      name: 'Trunc',
      components: [{ id: 'a', type: 'compute.vm', name: 'A', properties: { v: 'x' } }],
    };
    const after = structuredClone(before);
    after.components[0]!.properties = { v: 'y'.repeat(200) };
    const summary = formatDiff(diffModels(before, after));
    expect(summary).toContain('…');
    expect(Math.max(...summary.split('\n').map((l) => l.length))).toBeLessThan(120);
  });
});
