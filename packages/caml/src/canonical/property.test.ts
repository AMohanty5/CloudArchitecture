import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CamlDocument, Component, Connection, Group } from '../generated/caml-types.js';
import { hashModel } from './hash.js';

/* ------------------------------------------------------------------ *
 * Generators
 * ------------------------------------------------------------------ */

const TYPES = [
  'compute.vm',
  'compute.serverless.function',
  'database.relational',
  'messaging.queue',
  'network.loadbalancer.l7',
  'storage.object',
] as const;
const CONNECTION_KINDS = ['traffic', 'data', 'async', 'dependency'] as const;
const GROUP_KINDS = ['region', 'network', 'subnet', 'tier'] as const;
const PROP_KEYS = ['size', 'engine', 'replicas', 'public', 'note'] as const;

const arbPropValue = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.boolean(),
);
const arbProps = fc.dictionary(fc.constantFrom(...PROP_KEYS), arbPropValue, { maxKeys: 4 });

interface Recipe {
  componentCount: number;
  groupCount: number;
  connectionCount: number;
  types: (typeof TYPES)[number][];
  groupKinds: (typeof GROUP_KINDS)[number][];
  connectionKinds: (typeof CONNECTION_KINDS)[number][];
  props: Record<string, string | number | boolean>[];
  endpointPicks: number[];
  groupAssignment: number[];
  includeAnnotations: boolean;
}

const arbRecipe: fc.Arbitrary<Recipe> = fc.record({
  componentCount: fc.integer({ min: 1, max: 7 }),
  groupCount: fc.integer({ min: 0, max: 3 }),
  connectionCount: fc.integer({ min: 0, max: 8 }),
  types: fc.array(fc.constantFrom(...TYPES), { minLength: 7, maxLength: 7 }),
  groupKinds: fc.array(fc.constantFrom(...GROUP_KINDS), { minLength: 3, maxLength: 3 }),
  connectionKinds: fc.array(fc.constantFrom(...CONNECTION_KINDS), { minLength: 8, maxLength: 8 }),
  props: fc.array(arbProps, { minLength: 7, maxLength: 7 }),
  endpointPicks: fc.array(fc.nat({ max: 1000 }), { minLength: 16, maxLength: 16 }),
  groupAssignment: fc.array(fc.nat({ max: 1000 }), { minLength: 7, maxLength: 7 }),
  includeAnnotations: fc.boolean(),
});

function buildDoc(r: Recipe): CamlDocument {
  const groups: Group[] = Array.from({ length: r.groupCount }, (_, i) => ({
    id: `g${i}`,
    kind: r.groupKinds[i]!,
    name: `Group ${i}`,
  }));
  const components: Component[] = Array.from({ length: r.componentCount }, (_, i) => {
    const c: Component = {
      id: `c${i}`,
      type: r.types[i]!,
      name: `Component ${i}`,
      properties: r.props[i]!,
    };
    if (r.groupCount > 0 && r.groupAssignment[i]! % (r.groupCount + 1) !== r.groupCount) {
      c.group = `g${r.groupAssignment[i]! % r.groupCount}`;
    }
    return c;
  });
  const connections: Connection[] = Array.from({ length: r.connectionCount }, (_, i) => ({
    id: `e${i}`,
    from: `c${r.endpointPicks[2 * i]! % r.componentCount}`,
    to: `c${r.endpointPicks[2 * i + 1]! % r.componentCount}`,
    kind: r.connectionKinds[i]!,
  }));
  const doc: CamlDocument = {
    camlVersion: '1.0',
    id: 'arch_PROPTEST',
    name: 'Property-test architecture',
    components,
  };
  if (groups.length > 0) doc.groups = groups;
  if (connections.length > 0) doc.connections = connections;
  if (r.includeAnnotations) {
    doc.annotations = [{ target: 'c0', kind: 'note', body: 'non-semantic note' }];
  }
  return doc;
}

const arbDoc = arbRecipe.map(buildDoc);

/* ------------------------------------------------------------------ *
 * Deterministic shuffling (seeded, so failures shrink reproducibly)
 * ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: readonly T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Rebuild with shuffled key insertion order everywhere and shuffled id-bearing arrays. */
function deepShuffle(value: unknown, rnd: () => number): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((v) => deepShuffle(v, rnd));
    const idBearing =
      mapped.length > 0 &&
      mapped.every(
        (v) =>
          typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string',
      );
    return idBearing ? shuffleArray(mapped, rnd) : mapped;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of shuffleArray(Object.entries(value), rnd)) out[k] = deepShuffle(v, rnd);
    return out;
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Semantic mutations (each must change the hash)
 * ------------------------------------------------------------------ */

type MutationKind = 'rename' | 'retype' | 'add-component' | 'change-property' | 'mutate-connection';

function mutate(doc: CamlDocument, kind: MutationKind): CamlDocument {
  const out = structuredClone(doc);
  const first = out.components[0]!;
  switch (kind) {
    case 'rename':
      first.name = `${first.name} (renamed)`;
      break;
    case 'retype':
      first.type = first.type === 'compute.vm' ? 'database.cache' : 'compute.vm';
      break;
    case 'add-component':
      out.components.push({ id: 'zzz-added', type: 'storage.object', name: 'Added' });
      break;
    case 'change-property':
      first.properties = { ...first.properties, mutatedMarker: 12345 };
      break;
    case 'mutate-connection':
      if (out.connections && out.connections.length > 0) {
        const conn = out.connections[0]!;
        conn.kind = conn.kind === 'traffic' ? 'replication' : 'traffic';
      } else {
        out.connections = [{ id: 'zzz-conn', from: 'c0', to: 'c0', kind: 'dependency' }];
      }
      break;
  }
  return out;
}

const arbMutation = fc.constantFrom<MutationKind>(
  'rename',
  'retype',
  'add-component',
  'change-property',
  'mutate-connection',
);

/* ------------------------------------------------------------------ *
 * Properties (≥1000 generated cases total across the suite)
 * ------------------------------------------------------------------ */

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
