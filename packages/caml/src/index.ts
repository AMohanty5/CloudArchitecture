/**
 * @cac/caml — CAML (Cloud Architecture Modeling Language) core library.
 *
 * The spine of the product (blueprint doc 05). This package owns:
 *  - CAML document types (generated from schemas/caml-1.0.schema.json) — Day 2
 *  - structural validation — Day 2
 *  - canonicalization + content hashing — Day 3
 *  - typed diff — Day 4
 *  - patch apply/invert — Day 5
 *
 * Invariant: this package is pure TypeScript with no dependency on app code.
 */

export const CAML_VERSION = '1.0' as const;

/** Placeholder document shape until Day 2 generates the full types from the schema. */
export interface CamlDocumentStub {
  camlVersion: typeof CAML_VERSION;
  id: string;
  name: string;
}

/** Day 1 smoke API — replaced by the real validator on Day 2. */
export function isCamlVersionSupported(version: string): boolean {
  return version === CAML_VERSION;
}
