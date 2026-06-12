import { canonicalizeValue } from '../canonical/canonicalize.js';
import type {
  CamlDocument,
  Component,
  Connection,
  Deployment,
  Group,
  Policy,
  Requirement,
} from '../generated/caml-types.js';

/**
 * Typed semantic diff (blueprint doc 02's ModelDiff value object).
 *
 * Matching is id-anchored: ids are the diff anchor (doc 05), so a rename is a
 * `name` change on the same element, never a remove+add. Equality is canonical
 * (same rules as content hashing), which guarantees:
 *
 *   diffIsEmpty(diffModels(a, b)) ⟺ hashModel(a) === hashModel(b)
 *
 * Annotations are non-semantic and never appear in a diff.
 */

export interface PropertyChange {
  /** Dotted path within the element (or document), e.g. `properties.multiAz`. */
  path: string;
  /** Value before the change; `undefined` means the path did not exist. */
  before?: unknown;
  /** Value after the change; `undefined` means the path was removed. */
  after?: unknown;
}

export interface ModifiedElement {
  id: string;
  changes: PropertyChange[];
}

export interface CollectionDiff<T> {
  /** Present in `after` only — in `after` array order. */
  added: T[];
  /** Present in `before` only — in `before` array order. */
  removed: T[];
  /** Present in both with differences — in `before` array order. */
  modified: ModifiedElement[];
}

export interface ModelDiff {
  components: CollectionDiff<Component>;
  connections: CollectionDiff<Connection>;
  groups: CollectionDiff<Group>;
  policies: CollectionDiff<Policy>;
  requirements: CollectionDiff<Requirement>;
  deployments: CollectionDiff<Deployment>;
  /** Top-level field changes: name, description, metadata, … */
  document: PropertyChange[];
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  documentChanges: number;
  total: number;
}

const ELEMENT_COLLECTIONS = [
  'components',
  'connections',
  'groups',
  'policies',
  'requirements',
  'deployments',
] as const;

/** Top-level keys that are not plain document fields. */
const DOCUMENT_SKIP = new Set<string>([...ELEMENT_COLLECTIONS, 'annotations']);

export function diffModels(before: CamlDocument, after: CamlDocument): ModelDiff {
  return {
    components: diffCollection(before.components, after.components),
    connections: diffCollection(before.connections, after.connections),
    groups: diffCollection(before.groups, after.groups),
    policies: diffCollection(before.policies, after.policies),
    requirements: diffCollection(before.requirements, after.requirements),
    deployments: diffCollection(before.deployments, after.deployments),
    document: diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      '',
      DOCUMENT_SKIP,
    ),
  };
}

export function diffIsEmpty(diff: ModelDiff): boolean {
  return diffStats(diff).total === 0;
}

export function diffStats(diff: ModelDiff): DiffStats {
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const key of ELEMENT_COLLECTIONS) {
    added += diff[key].added.length;
    removed += diff[key].removed.length;
    modified += diff[key].modified.length;
  }
  const documentChanges = diff.document.length;
  return { added, removed, modified, documentChanges, total: added + removed + modified + documentChanges };
}

/** id is the match key, so it is never part of an element's change set. */
const ELEMENT_SKIP = new Set(['id']);

function diffCollection<T extends { id: string }>(
  before: T[] | undefined,
  after: T[] | undefined,
): CollectionDiff<T> {
  const beforeArr = before ?? [];
  const afterArr = after ?? [];
  const beforeById = new Map(beforeArr.map((e) => [e.id, e]));
  const afterById = new Map(afterArr.map((e) => [e.id, e]));

  const added = afterArr.filter((e) => !beforeById.has(e.id));
  const removed = beforeArr.filter((e) => !afterById.has(e.id));
  const modified: ModifiedElement[] = [];
  for (const el of beforeArr) {
    const counterpart = afterById.get(el.id);
    if (!counterpart) continue;
    const changes = diffObjects(
      el as Record<string, unknown>,
      counterpart as Record<string, unknown>,
      '',
      ELEMENT_SKIP,
    );
    if (changes.length > 0) modified.push({ id: el.id, changes });
  }
  return { added, removed, modified };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep object diff producing dotted-path changes. Two plain objects recurse
 * for precise per-key paths; an object appearing or disappearing entirely is a
 * single atomic change carrying the whole object (so a diff can be replayed
 * exactly — `applyDiff` reconstructs absent-vs-empty faithfully, which key-level
 * recursion into `undefined` could not). Arrays and scalars are atomic and
 * compared canonically.
 */
function diffObjects(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  basePath: string,
  skip?: ReadonlySet<string>,
): PropertyChange[] {
  const changes: PropertyChange[] = [];
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  for (const key of keys) {
    if (basePath === '' && skip?.has(key)) continue;
    const b = before?.[key];
    const a = after?.[key];
    if (b === undefined && a === undefined) continue;
    const path = basePath ? `${basePath}.${key}` : key;

    const recursable = isPlainObject(b) && isPlainObject(a);
    if (recursable) {
      changes.push(...diffObjects(b as Record<string, unknown>, a as Record<string, unknown>, path));
      continue;
    }
    if (b === undefined || a === undefined) {
      changes.push({ path, before: b, after: a });
      continue;
    }
    if (canonicalizeValue(b) !== canonicalizeValue(a)) {
      changes.push({ path, before: b, after: a });
    }
  }
  return changes;
}
