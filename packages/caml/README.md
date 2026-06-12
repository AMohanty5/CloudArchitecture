# @cac/caml

The CAML (Cloud Architecture Modeling Language) core library — the spine of the
product (blueprint doc 05). Pure TypeScript, no dependency on app code, runs
identically in Node services and the browser canvas.

Everything downstream (API write path, canvas CommandBus, AI proposals, diff UI,
3-way merge) is built on the primitives here, so this package gets the
most-tested treatment: schema + property-based + round-trip tests.

## API surface

```ts
import {
  CAML_VERSION,            // '1.0'
  camlSchema,              // the JSON Schema (frozen, embedded)
  validateStructure,      // pass-1 validation: shape + integrity
  indexModel,             // O(1) lookups over a document
  canonicalize, hashModel, // deterministic identity
  diffModels, formatDiff, // typed semantic diff
  applyDiff,              // apply a typed diff (inverse of diffModels)
  applyPatch, invertPatch, applyModelPatch, // RFC-6902 mutation primitive
  PatchError,
} from '@cac/caml';
import type { CamlDocument, ModelDiff, JsonPatch, CommitHash } from '@cac/caml';
```

### Validation — `validateStructure(input): ValidationResult`
Pass 1 of the 3-pass pipeline. Pass 1a is JSON Schema (shape, enums, id
patterns) via Ajv; pass 1b is integrity the schema cannot express — global id
uniqueness, reference resolution, group containment (acyclic, depth ≤ 8). Errors
are element-anchored (`component "api-lb" (components[1].binding.service): …`).
Catalog property checks (pass 2) and semantic rules (pass 3) live elsewhere.

### Identity — `canonicalize(doc): string`, `hashModel(doc): CommitHash`
Canonical form: keys sorted, id-bearing arrays sorted by id, `annotations`
excluded, `undefined` dropped, non-finite numbers rejected. Empty arrays are
**kept** (`components: []` is meaningful). `hashModel` is the SHA-256 of the
canonical form — the commit primitive. Layout is a commit sidecar, never part of
the document.

### Diff — `diffModels(before, after): ModelDiff`
Id-anchored: a rename is a `name` change on the same element, never remove+add.
Per-collection `added`/`removed`/`modified`, plus document-level field changes.
Property changes carry dotted paths (`properties.multiAz`). A nested object
appearing or disappearing entirely is one atomic change carrying the whole
object (so the diff replays exactly). `formatDiff` renders it like a PR
description.

### Apply a diff — `applyDiff(before, diff): CamlDocument`
The inverse of `diffModels`: reconstructs the diff's `after` side. Used to
materialize a target model from a base + recorded diff.

### Patch — `applyPatch`, `invertPatch`, `applyModelPatch`
RFC 6902 (JSON Patch) over RFC 6901 (JSON Pointer) — the mutation primitive the
canvas, AI, and merge express edits with. `applyPatch` is content-agnostic and
never mutates its input; `invertPatch(doc, p)` returns the inverse patch relative
to the pre-image; `applyModelPatch` applies and then asserts the result is a
structurally valid CAML model, throwing `PatchError` (with `.errors`) otherwise.
All four throw `PatchError` on malformed ops, unresolvable paths, or failed
`test` ops. Equality (for `test`) is canonical.

## Invariants (property-tested)

| Invariant | Meaning |
|---|---|
| `hashModel(a) === hashModel(b)` ⟺ semantically identical | key order, id-array order, and annotations never matter |
| `diffIsEmpty(diffModels(a, b))` ⟺ `hashModel(a) === hashModel(b)` | the diff agrees with the hash |
| `hashModel(applyDiff(a, diffModels(a, b))) === hashModel(b)` | diff/apply round-trip (1000 generated pairs) |
| `applyPatch(applyPatch(doc, p), invertPatch(doc, p))` ≡ `doc` | every patch is exactly reversible (undo / rollback) |
| `applyModelPatch` result is always valid, or it throws | a patch may never leave the model structurally invalid |

"≡" is canonical equality (the package's notion of "same model"): two documents
that hash equal are the same, regardless of formatting or annotations.

## Scripts

```bash
pnpm --filter @cac/caml test           # vitest
pnpm --filter @cac/caml exec vitest run --coverage
pnpm --filter @cac/caml build          # tsc -> dist (test files excluded)
pnpm --filter @cac/caml gen            # regenerate types from schemas/caml-1.0.schema.json
```
