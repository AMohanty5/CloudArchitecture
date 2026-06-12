/**
 * @cac/caml — CAML (Cloud Architecture Modeling Language) core library.
 *
 * The spine of the product (blueprint doc 05). This package owns:
 *  - CAML document types (generated from schemas/caml-1.0.schema.json) — Day 2 ✅
 *  - structural validation (schema + integrity) — Day 2 ✅
 *  - canonicalization + content hashing — Day 3 ✅
 *  - typed diff — Day 4 ✅
 *  - patch apply/invert + typed-diff round-trip — Day 5 ✅
 *
 * Invariant: this package is pure TypeScript with no dependency on app code.
 */

export const CAML_VERSION = '1.0' as const;

export { camlSchema } from './schema/caml-schema.js';
export type * from './generated/caml-types.js';
export { indexModel } from './types.js';
export type { ModelIndex } from './types.js';
export { validateStructure } from './validate/structural.js';
export type { CamlError, CamlErrorCode, ValidationResult } from './validate/errors.js';
export { canonicalize, canonicalizeValue } from './canonical/canonicalize.js';
export { hashModel } from './canonical/hash.js';
export type { CommitHash } from './canonical/hash.js';
export { diffModels, diffIsEmpty, diffStats } from './diff/diff.js';
export type {
  ModelDiff,
  CollectionDiff,
  ModifiedElement,
  PropertyChange,
  DiffStats,
} from './diff/diff.js';
export { formatDiff } from './diff/format.js';
export { applyPatch, applyModelPatch, invertPatch, PatchError } from './patch/patch.js';
export type { JsonPatch, JsonPatchOp } from './patch/patch.js';
export { applyDiff } from './patch/apply-diff.js';
