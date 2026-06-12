import type { CamlDocument } from '../generated/caml-types.js';
import type { ModelDiff, PropertyChange } from '../diff/diff.js';
import { PatchError } from './patch.js';

// structuredClone is a runtime global in Node 17+ and modern browsers.
const clone = <T>(v: T): T => (globalThis as unknown as { structuredClone<U>(value: U): U }).structuredClone(v);

/**
 * Apply a typed {@link ModelDiff} to a document, reconstructing the diff's
 * `after` side. This is the inverse of `diffModels`, up to canonical equality:
 *
 *   hashModel(applyDiff(a, diffModels(a, b))) === hashModel(b)
 *
 * Equality is canonical (the package's notion of "same model"): array order of
 * id-bearing collections, object key order, and annotations are non-semantic,
 * so the rebuilt document matches `b` by content even when it differs in those.
 *
 * Empty optional collections are dropped (the absent-when-empty convention), so
 * the canonical form matches a `b` that simply omits them.
 */

/** Collections in the document, in canonical-irrelevant order; `components` is the only required one. */
const ELEMENT_COLLECTIONS = [
  'requirements',
  'components',
  'connections',
  'groups',
  'policies',
  'deployments',
] as const;

export function applyDiff(before: CamlDocument, diff: ModelDiff): CamlDocument {
  const out = clone(before) as unknown as Record<string, unknown>;

  for (const key of ELEMENT_COLLECTIONS) {
    const collectionDiff = diff[key];
    const existing = Array.isArray(out[key]) ? (out[key] as { id: string }[]) : [];
    const byId = new Map<string, Record<string, unknown>>(
      existing.map((el) => [el.id, clone(el) as Record<string, unknown>]),
    );

    for (const removed of collectionDiff.removed) byId.delete(removed.id);

    for (const mod of collectionDiff.modified) {
      const el = byId.get(mod.id);
      if (!el) {
        throw new PatchError(`applyDiff: modified element "${mod.id}" is not present in ${key}`);
      }
      for (const change of mod.changes) applyPropertyChange(el, change);
    }

    for (const added of collectionDiff.added) {
      byId.set(added.id, clone(added) as unknown as Record<string, unknown>);
    }

    const result = [...byId.values()];
    if (result.length === 0 && key !== 'components') {
      delete out[key];
    } else {
      out[key] = result;
    }
  }

  for (const change of diff.document) applyPropertyChange(out, change);

  return out as unknown as CamlDocument;
}

/**
 * Apply one dotted-path change to a plain object in place. `after === undefined`
 * deletes the leaf; otherwise it is set (deep-cloned). Missing intermediate
 * objects are created — mirrors the differ, which only emits deep paths through
 * plain-object subtrees that exist on both sides.
 */
function applyPropertyChange(target: Record<string, unknown>, change: PropertyChange): void {
  const parts = change.path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      node[key] = created;
      node = created;
    } else {
      node = next as Record<string, unknown>;
    }
  }
  const last = parts[parts.length - 1]!;
  if (change.after === undefined) {
    delete node[last];
  } else {
    node[last] = clone(change.after);
  }
}
