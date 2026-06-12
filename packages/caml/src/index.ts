/**
 * @cac/caml — CAML (Cloud Architecture Modeling Language) core library.
 *
 * The spine of the product (blueprint doc 05). This package owns:
 *  - CAML document types (generated from schemas/caml-1.0.schema.json) — Day 2 ✅
 *  - structural validation (schema + integrity) — Day 2 ✅
 *  - canonicalization + content hashing — Day 3 ✅
 *  - typed diff — Day 4
 *  - patch apply/invert — Day 5
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
export { canonicalize } from './canonical/canonicalize.js';
export { hashModel } from './canonical/hash.js';
export type { CommitHash } from './canonical/hash.js';
