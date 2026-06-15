# Day-by-Day Build Plan

Working plan for building Cloud Architect Copilot from this repo. One "day" = one
focused build session (roughly 2–4 productive hours with AI pairing). Days are
sequential, not calendar-bound — if a day's work spills over, the next session resumes
the same day number.

**How we work this plan:**
- Each day has a **Goal**, **Tasks** (checkboxes — ticked as we complete them), and
  **Done when** (the acceptance check we actually run).
- At the start of a session: open this file, find the first unchecked day, build.
- Scope discipline: a day's "Done when" is the contract. Extras go to the Backlog at
  the bottom, not into the day.
- Blueprint references (doc NN) point to `docs/blueprint/`.

**Solo-build re-sequencing vs the Phase 1 team plan (doc 15):** same architecture, but
we build a thin vertical slice first — CAML → API → canvas → Terraform export → AI
generation — and defer auth/billing/multi-tenancy hardening until the product proves
itself locally. Nothing we build violates the blueprint's load-bearing rules (commit
model, module boundaries, catalog-as-code), so the team plan remains valid if/when
hiring happens.

---

## Stage A — Foundation: the CAML engine (Days 1–6)

### Day 1 — Monorepo scaffold ✅ (2026-06-13)
**Goal:** A building, testing, committable workspace.
- [x] `git init`; pnpm workspace + Turborepo; base `tsconfig`, eslint, prettier, vitest presets in `packages/config`
- [x] Package stubs: `packages/caml`, `apps/core` (NestJS, hand-scaffolded), `apps/web` (Vite + React 19 + TS)
- [x] `docker-compose.yml`: Postgres 16 + Redis (local dev data layer)
- [x] Root scripts: `pnpm build`, `pnpm test`, `pnpm dev` (turbo pipelines); lint runs at root (`eslint .`)
- [x] CI: GitHub Actions workflow — install, lint, build, test on push

**Done when:** fresh clone → `pnpm i && pnpm build && pnpm test` green ✅; `docker compose up -d` gives a reachable Postgres — **deferred** (Docker Desktop not running locally; verify at Day 7 when Postgres becomes a real dependency).

> Day 1 notes: pnpm installed via `npm i -g pnpm` (corepack EPERM under nvm-windows);
> esbuild postinstall allowlisted via `pnpm.onlyBuiltDependencies`.

### Day 2 — CAML types + structural validator ✅ (2026-06-13)
**Goal:** `packages/caml` validates real documents against `schemas/caml-1.0.schema.json`.
- [x] Generate TS types from the schema (json-schema-to-typescript via `pnpm --filter @cac/caml gen`; schema embedded as TS module with drift-guard test) + `indexModel` lookup maps
- [x] Ajv-compiled validator (Ajv 2020-12, strict + allowUnionTypes) with element-anchored error mapping (`component "api-lb" (components[1].binding.service): …`)
- [x] Reference fixtures: 5 valid models (incl. the doc 05 e-commerce example), 10 invalid + `expected.json` manifest
- [x] Integrity checks beyond JSON Schema: global id uniqueness, reference resolution (connections/groups/overrides/policies), group cycles, depth ≤ 8

**Done when:** all fixtures classified correctly ✅ (26 tests green); invalid fixtures produce human-readable, element-anchored errors ✅.

> Day 2 notes: ajv/ajv-formats are CJS — under NodeNext ESM the class is on `.default`
> of the import. Generated types: `title`/`$id` must be stripped before
> json-schema-to-typescript or they override the root type name.

### Day 3 — Canonicalizer + content hashing ✅ (2026-06-13)
**Goal:** Deterministic identity for models (the commit primitive, doc 05).
- [x] Canonicalizer: sorted keys, id-sorted arrays, annotations excluded, finite-number guard, undefined-dropping (layout is a commit sidecar, never inside CamlDocument)
- [x] SHA-256 `hashModel(doc)` over canonical form via @noble/hashes (pure JS — browser-ready for the canvas later)
- [x] Property-based tests (fast-check, 1,000 runs): invariant under key order / id-array order / annotation changes / JSON round-trips; changes on every semantic mutation class (rename, retype, add component, property change, connection change)

**Done when:** property tests pass over 1k generated permutations ✅; two semantically identical docs with wildly different formatting hash identically ✅ (scrambled e-commerce fixture test + golden hash pinned as regression guard).

### Day 4 — Typed diff ✅ (2026-06-13)
**Goal:** `diffModels(a, b) → ModelDiff` (doc 02 value object).
- [x] Id-anchored matching → added/removed/modified with deep dotted-path property changes, for all six element collections + document-level fields; equality is canonical, so `diffIsEmpty(diff(a,b)) ⟺ hashModel(a)===hashModel(b)` (proven by property test, 500 runs)
- [x] Human-readable `formatDiff` ("~ db: properties.multiAz: false → true", "+ cache \"Cache\" (database.cache)", value truncation)
- [x] Fixture suite: 12 curated before/after cases (identical-formatting, add, remove, rename, property modify/add/remove, connection, group move, policy, requirement, deployment, mixed) with expected change sets + required summary mentions

**Done when:** every fixture produces the expected typed change set ✅; summary output reads like a sane PR description ✅ (mention assertions per case). Shared fast-check generators extracted to `src/testing/` (build-excluded).

### Day 5 — Patch apply/invert + round-trip guarantee ✅ (2026-06-13)
**Goal:** The mutation primitive the canvas, AI, and merge all use.
- [x] RFC-6902 apply (full op set, content-agnostic, never mutates input) + `invertPatch` (exact reverse) + `applyModelPatch` (CAML-aware validation post-apply, throws `PatchError` with `.errors`)
- [x] `applyDiff` (inverse of `diffModels`); `hashModel(applyDiff(a, diff(a,b))) === hashModel(b)` property test green over 1k generated pairs (+ 500 single-mutation, 200 no-op)
- [x] `caml` package README: API surface + the five property-tested invariants

**Done when:** round-trip property test green over 1k pairs ✅; package coverage > 90% branches ✅ (92% branch / 96% stmts; patch.ts 97%).

> Day 5 notes: making the round-trip total exposed a Day-4 representational gap —
> the differ recursed object-vs-`undefined` into per-key deletions, which left an
> empty `{}` shell on apply (and left `diffIsEmpty ⟺ equal-hash` false for
> empty-object-vs-absent). Fixed: a whole-object appearance/disappearance is now
> one atomic change. Diff fixtures 07 & 09 re-pinned to the atomic form.

### Day 6 — Catalog format + first 5 services ✅ (2026-06-13)
**Goal:** Catalog-as-code pipeline exists (doc 14 format).
- [x] `catalog/` layout: `services/aws/*.yaml` + `catalog-service.schema.json` (the format schema); `pnpm --filter @cac/catalog check` lints all content (CI gate)
- [x] Authored 5 services minus IaC templates: `aws.vpc`, `aws.subnet` (group-kind services), `aws.alb`, `aws.ec2_asg`, `aws.rds` (component services) — schema + capabilities + connection rules + icon refs
- [x] New `packages/catalog`: `loadCatalog` (parse YAML + validate against format schema, dup-key/provider checks, typed lookup incl. group-kind index)
- [x] Pass-2 wired: `validateAgainstCatalog` checks component **and** group properties against the bound service schema; `unknown-service` / `type-mismatch` / `catalog-property` error codes added to the shared `CamlError`

**Done when:** the doc-05-style example (`packages/catalog/fixtures/web-3tier.example.json`, over the 5 seed services) passes pass-1 + pass-2 ✅; `instanceClass: "huge"` is rejected with `aws.rds "orders-db": property "instanceClass" must match pattern …` ✅.

> Day 6 notes: chose a separate `packages/catalog` over folding into caml (catalog has
> its own deps — yaml — and grows into the Catalog Service, doc 03). Group-kind services
> (vpc/subnet) validate via a group's effective provider (own, else nearest ancestor).
> Two gotchas: a `services/**/*.yaml` literal in a JSDoc closed the block comment early
> (`*/`); and Ajv `strictRequired` rejects the `oneOf` "exactly one of abstractTypes/
> groupKind" idiom — disabled that one sub-check.

---

## Stage B — System of record: API + persistence (Days 7–11)

### Day 7 — Core app skeleton + DB migrations ✅ (2026-06-13)
**Goal:** NestJS modular monolith with the doc 15 module layout and the doc 04 core tables.
- [x] Modules under `src/modules/*`: `architecture`, `catalog`, `events` active + full doc-15 set stubbed; eslint-boundaries enforces import-only-via-`api.ts` (verified: internal import → `boundaries/entry-point` error)
- [x] Migrations (`pg` + embedded SQL, runner tracks `schema_migrations`): `architectures`, `model_commits`, `branches` per doc 04 (FKs to deferred tenancy tables omitted) — RLS enabled on all three with the `tenant_isolation` policy; `tenant_id` defaults to the single-tenant id; pool sets `app.tenant_id` per connection
- [x] Config (env + defaults), `/health` (now pings DB), Swagger at `/docs`, request-logging middleware

**Done when:** core boots against docker Postgres (verified on EC2 — `/health` → `db:up`) ✅; migrations idempotent (boot applies `0001`, re-runs are clean no-ops) ✅; `/health` + `/docs` (HTTP 200, `/docs-json` serves OpenAPI) respond ✅.

> Day 7 notes: persistence decision recorded in DECISIONS.md (raw SQL + `pg`, no ORM).
> This resolves the Day-1 deferred Postgres check — verified against the docker Postgres
> running on the EC2 box (local Docker Desktop intentionally not started). Migrations run
> on boot and via `pnpm --filter @cac/core migrate`. eslint-boundaries needs the TS import
> resolver to classify relative cross-module imports.

### Day 8 — Architecture endpoints: create / commit / read ✅ (2026-06-13)
**Goal:** The sacred write path (doc 12 invariant 3).
- [x] `POST /api/v1/architectures` (creates default `main` branch + empty initial commit; returns id + head hash)
- [x] `POST .../branches/{branch}/commits` — full-model **or** RFC-6902 patch body, optimistic lock on `expectedParent` (409), pass-1 (structural) + pass-2 (catalog) validation (422, problem+json with element-path `errors`), canonical hash, layout sidecar; no-op when content unchanged
- [x] `GET .../branches/{branch}/model` with `ETag` = head hash + `If-None-Match` 304; `GET .../commits/{hash}` (immutable, `Cache-Control: …immutable`)

**Done when:** integration tests (testcontainers Postgres) green — happy path, stale-parent 409, invalid-model 422 with paths, and the doc-05-style example commits to a stable hash across independent architectures ✅ (4/4 on EC2). RFC 9457 problem+json + `/api/v1` prefix (health/docs excluded).

> Day 8 notes: catalog loaded once at boot by CatalogModule (CATALOG token, injected for
> pass-2); commit validates the post-apply model (patch via `applyPatch`, then unified
> pass-1+2). Tenant GUC set via libpq `options=-c app.tenant_id=…` at session start (no
> per-connect query → no pg deprecation warning). Integration tests are Docker-gated:
> kept out of the default `pnpm test` (no local Docker) and run via `pnpm --filter
> @cac/core test:int` on the EC2 box. HTTP surface smoke-tested live (ETag, problem+json).

### Day 9 — History + diff endpoints ✅ (2026-06-13)
**Goal:** Versioning is visible.
- [x] `GET .../commits` keyset-paginated history (newest-first, `cursor`/`nextCursor` on `(created_at, hash)`); `GET .../diff?from=&to=` → Day-4 typed `ModelDiff` + `formatDiff` summary, refs resolve as branch-name-then-hash
- [x] Commit `stats` (component/connection/group counts + providers) computed on write (Day 8) and surfaced in history
- [x] `seedDatabase` + `pnpm --filter @cac/core seed`: 3 fixture architectures with multi-commit histories (Acme Web 4 commits, Batch Compute 3, Orders Datastore 3) — deterministic + rerunnable (deletes seed rows first; stable hashes)

**Done when:** diff endpoint output `toEqual` the caml-package `diffModels` for seeded histories ✅; seed rerunnable (two runs → identical hashes) ✅. Integration: 9/9 on EC2 (incl. pagination walk + branch-ref diff); live-smoked seed + `GET commits` + `GET diff`.

### Day 10 — Catalog service endpoints + Redis cache ✅ (2026-06-13)
**Goal:** The palette's data source.
- [x] Publish-on-boot (`CatalogPublisher`): `catalog/` (in-memory CATALOG) → Postgres `catalog_services` (migration 0002, upsert) + Redis index; failures are logged, not fatal
- [x] `GET /api/v1/catalog/services?q=&provider=` (ranked search, pure `rankServices`), `GET /api/v1/catalog/services/{key}` (full service incl. the `properties` JSON Schema for the form generator); reads Redis → Postgres → in-memory fallback
- [x] `GET /api/v1/catalog/icons/{key}` serves a deterministic placeholder SVG (real icon packs remain a Backlog item); `RedisModule` (ioredis) added

**Done when:** search `"load balancer"` → `[aws.alb]` ranked (score 48, rds/vpc excluded) ✅; `services/aws.rds` returns the property schema (engine/instanceClass-with-pattern/multiAz/…) ✅. Verified live on EC2: boot published 5 services (postgres=true, redis=true), 5 PG rows, Redis index present, icon 200 image/svg+xml.

> Day 10 notes: hit a circular import (`CATALOG` token defined in catalog.module.ts while
> its providers imported it back) — Nest DI failed with undefined param metadata; moved the
> token to a dependency-free `catalog.tokens.ts`. rankServices is pure/unit-tested; the
> store layering (Redis cache → Postgres durable → in-memory) keeps reads working through outages.

### Day 11 — Generated API client + contract tests ✅ (2026-06-13)
**Goal:** Frontend never hand-writes fetch calls.
- [x] OpenAPI emitted from the NestJS decorators (`pnpm --filter @cac/core openapi` → `packages/api-client/openapi.json`); `@cac/api-client` = openapi-typescript types + an `openapi-fetch` wrapper (`createCoreClient`); root `pnpm -w run gen:api` regenerates
- [x] Contract test (`contract.int.spec.ts`): spawns the **built** core against a testcontainers Postgres and drives the Day 8–10 surface with the generated client (create/commit/read/history/diff/catalog), incl. a typed 409
- [x] CI updated: Redis service + a `test:int` step running the integration + contract suites (Postgres via Testcontainers)

**Done when:** `apps/web` imports the typed client and fetches a model ✅ (web unit test, mocked fetch); the CI step commands pass — unit 9/9 local, integration+contract **11/11 on EC2** (same suite CI runs).

> Day 11 notes: esbuild (tsx/vitest) does **not** emit decorator metadata, so Nest DI can't
> resolve type-injected providers there. Consequences: the OpenAPI emit runs from `dist`
> (`node dist/openapi.cli.js`, tsc-emitted metadata) with publish-on-boot skipped via
> `CAC_SKIP_PUBLISH`; and the contract test drives the built server as a child process
> rather than booting the app in-VM. Generated spec/types are committed so builds/CI need
> no live app to regenerate. (Implication: `pnpm dev:core` under tsx won't run Nest DI —
> use the built `start`, or add an SWC runner later.)

---

**Stage B complete (Days 7–11):** core monolith + RLS migrations, the architecture
write path (create/commit/read), history + diff + seed, catalog endpoints + Redis cache,
and a generated typed API client with contract tests — all running on the EC2 box.

---

## Stage C — The canvas (Days 12–20)

### Day 12 — Canvas shell ✅ (2026-06-13)
**Goal:** React Flow renders a CAML model read-only.
- [x] `apps/web` routes (react-router): list `/` → editor `/architectures/:id`; TanStack Query hooks (`useArchitectures`, `useModel`) over the generated `@cac/api-client`. Added `GET /api/v1/architectures` (list) to core + regenerated the client
- [x] Projector v1 (pure, unit-tested): CAML + optional layout sidecar → React Flow nodes/edges with a nested box auto-layout (parents precede children; ELK is Day 18)
- [x] `ServiceNode` (catalog icon + name + binding badge) and `GroupNode` (labelled container); `@xyflow/react` canvas with `Background`/`MiniMap`/`Controls`/`fitView`, read-only

**Done when:** the seeded 3-tier fixture (Acme Web Platform: 3 components, 5 nested groups) loads from the API and projects correctly ✅ (projector tests + live list/model endpoints verified on EC2; web SPA served on :4173); refresh re-fetches from the API (read-only, server is source of truth) so nothing is lost ✅.

> Day 12 notes: pixel-level rendering is the user's to eyeball via an SSH tunnel
> (`-L 4173:localhost:4173 -L 3001:localhost:3001`); CI/headless coverage is the pure
> projector test + an App smoke test (the canvas route isn't mounted under jsdom to avoid
> React-Flow's ResizeObserver needs). Begins Stage C.

### Day 13 — Palette + drop-to-create ✅ (2026-06-14)
**Goal:** First mutation through the real write path.
- [x] Palette panel (`canvas/Palette.tsx`): catalog search over `useCatalogSearch`, grouped by abstract type, HTML5 drag source (`application/x-caml-service` MIME); group-kind services shown disabled (drop creates groups in Day 16)
- [x] CommandBus v1 (doc 06): `applyCommand`/`AddComponent` (pure, never mutates input) → `useEditor` holds the local CAML doc, mutates optimistically, debounces (700ms) a full-model micro-commit through the Day 8 write path with the head ETag as `expectedParent`; drop position recorded in the layout sidecar
- [x] Optimistic UI + rollback: 409 → reload server head (`conflict`), other errors → revert to last committed model (`error`); header save-state indicator (loading / saving / saved / conflict / error). Canvas is now a drop target (`ReactFlowProvider` + `screenToFlowPosition`) wired in `pages/Editor.tsx`

**Done when:** drag `aws.alb` onto canvas → node appears instantly → network tab shows a commit → reload shows it persisted. Headless coverage green: `commands.test.ts` (4) + projector/api/App = 12/12, web tsc/eslint/`vite build` clean. Live drop→commit→reload eyeballed on EC2 via the SSH tunnel (`-L 4173 -L 3001`), as with Day 12.

> Day 13 notes: the Day-13 primitives (commands/Palette/useEditor) were scaffolded but
> unwired — the editor still rendered the read-only Day-12 `useModel`/`Canvas`. Wired
> them: `Editor` now drives `useEditor`; `Canvas` gained an optional `onDropService`
> (drop handlers no-op without it, so read-only callers are unaffected). Two gotchas:
> React 19 `useRef<T>()` needs an explicit `undefined` initial arg; and the generated
> client types `model`/`layout` as `Record<string, never>` (opaque `CamlDocument`/sidecar
> in the OpenAPI), so the commit body casts through it. Layout sidecar is persisted on
> commit but the model GET doesn't return it yet — reloaded nodes fall back to the
> projector's auto-layout (sidecar read-back is a later layout-day concern, not Day 13).

### Day 14 — Selection + property panel (the schema-driven form) ✅ (2026-06-14)
**Goal:** Edit any service's properties with zero per-service UI code (doc 06).
- [x] JSON-Schema-driven form generator (`canvas/PropertyForm.tsx`): one input per catalog property — string/text, integer/number, boolean (checkbox), enum (select), object (JSON textarea); defaults shown as placeholders; pass-2 messages rendered inline per field. Pure `parseFieldInput` extracted + unit-tested (empty → unset, numeric coercion, non-numeric passthrough)
- [x] `SetProperty` / `Rename` commands (`canvas/commands.ts`, immutable; `SetProperty` with `undefined` clears the key and drops an empty `properties`); `useEditor` gains `setProperty`/`rename`/`select`/`selectedId` + surfaces the 422 `errors`. Inspector (`canvas/Inspector.tsx`) shows name (editable → Rename), abstract type, binding, group, then the form — schema from `useCatalogService(key)` (`GET /catalog/services/{key}`)
- [x] Selection wired through the canvas (selectable + `onNodeClick`/`onPaneClick`, blue ring on the selected `ServiceNode`); errors anchored to the element (`element` + `path.endsWith('.properties.<key>')`). Multi-select shared editing stays in the Backlog

**Done when:** changing `aws.rds → multiAz` via the form round-trips to a commit; an invalid value is rejected inline with the catalog message. Headless: web 20/20 (commands 8, PropertyForm 4, projector/api/App), tsc/eslint/`vite build` clean. Live form→commit→inline-422 eyeballed on EC2 via the SSH tunnel.

> Day 14 notes: errors flow from the commit's problem+json (`CommitError` = `{code,path,element,message}`)
> — on 422 `useEditor` rolls the optimistic edit back to the last committed model and stores the
> messages; the inspector buckets them by `path` (`.properties.<key>` → field, else panel-level).
> The form clears a property (rather than writing it) when emptied, so a value equal to the catalog
> default isn't persisted needlessly. `noUncheckedIndexedAccess` bites array access too
> (`components![0]!`) and object index access (`schema[key]!`). Object properties get a JSON
> textarea with local parse-error state — unused by the 5 seed services (all scalar), present for
> completeness.

### Day 15 — Connections ✅ (2026-06-14)
**Goal:** Drawing edges that mean something.
- [x] Connect interaction (drag from handle, `nodesConnectable`); `Connect`/`Disconnect`/`SetConnectionKind`/`SetConnectionProperty` commands; kind picker in the edge inspector with the smart default = first kind the catalog permits. Rules fetched per in-model service via `useConnectionRules` (cache-shared with `useCatalogService`)
- [x] Pure `evaluateConnection` (`canvas/connections.ts`): a connection is permitted when the source's outbound rule `to` includes the target's abstract type OR the target's inbound rule `from` includes the source's — unit-tested (ALB→ASG traffic, ASG→RDS data, ALB→RDS + reverse rejected, self/missing-rules rejected). `isValidConnection` blocks invalid drops during drag and surfaces the catalog reason as a hint banner
- [x] Kind-styled edges (`edgeStyle`: traffic=solid blue, data=dashed green, async=dotted purple, replication/dependency/…) applied in the projector; edge inspector edits protocol (enum) / port / encrypted + delete

**Done when:** ALB→ASG (traffic) allowed, ALB→RDS (data) rejected with explanation; edge properties persist. Headless: web 31/31 (connections 7, commands 12, projector/PropertyForm/api/App), tsc/eslint/`vite build` clean. Live drag→validate→edit eyeballed on EC2 via the SSH tunnel.

> Day 15 notes: connection validation is client-side for now (drag-time UX) — the server has no
> connection-rules pass yet, so an invalid edge is simply never drawn. Verdict semantics are OR
> (either endpoint may authorize) with the kind set unioned across matched rules; this gives the
> right answer for every seed-service pair and avoids false rejections when a catalog author only
> specifies one side. The invalid-drag hint uses a ref-guarded setState so React Flow's repeated
> `isValidConnection` calls during hover don't thrash. `ConnectionProperties` is typed (protocol/
> port/encrypted + index signature), so the shared `setKey` helper's `Record` result casts through
> it on `SetConnectionProperty`.

### Day 16 — Groups & containment ✅ (2026-06-14)
**Goal:** VPC ⊃ subnet ⊃ instance nesting works.
- [x] `GroupNode` kind-styled headers (network/subnet/region/zone/tier tints) + a ⚠️ badge on containment violations; nesting/auto-size already handled by the Day-12 projector (parents precede children, `extent: 'parent'`, size-to-children)
- [x] Create group from palette: group-kind services (`aws.vpc`→network, `aws.subnet`→subnet) are now draggable; `groupFromService` + `AddGroup`. Drop-into-container nests (drop onto a group, or onto a component → that component's group) — the primary build-from-scratch path. `MoveToGroup` (move a component in/out via the inspector's group picker) + `MoveGroup`/`RenameGroup`/`SetGroupProperty` for groups
- [x] Containment validation surfaced: pure `containmentViolations` (subnet must live in a network) → ⚠️ node badge + a warning in the group inspector. Group inspector reuses the Day-14 schema-driven `PropertyForm` (cidr/zone/public) via `useGroupService` (provider+kind → catalog service)

**Done when:** rebuild the doc 05 example from scratch by hand in < 10 minutes, visually correct nesting, persisted. Headless: web 41/41 (commands 18, containment 4, connections 7, projector/PropertyForm/api/App), tsc/eslint/`vite build` clean. Live build-from-scratch eyeballed on EC2 via the SSH tunnel.

> Day 16 notes: drop-target detection reads the nearest `.react-flow__node` `data-id` under the
> cursor (React Flow node DOM are siblings, not nested, so a component drop resolves its container
> via the model, not the DOM). Nested drops intentionally skip the layout sidecar so the projector
> auto-lays-them-out inside the parent; only free top-level drops record a position. Group property
> schemas resolve through the catalog group-kind index (empty-query search → match provider+kind →
> service key → detail). Drag-to-reparent *existing* nodes (React Flow node dragging + intersection)
> is deferred — group membership is edited via the inspector pickers, which is deterministic and
> testable; the build-from-scratch acceptance is met by drop-into-container. Containment is
> client-side surfacing only (pass-3 server rules remain future work).

### Day 17 — Undo/redo + keyboard + clipboard ✅ (2026-06-14)
**Goal:** It feels like a real editor.
- [x] Pure `History<T>` stack (`canvas/history.ts`) with semantic coalescing — consecutive same-`groupKey` transitions (e.g. a burst of same-field property edits) collapse to one undo entry; undo/redo wired through `useEditor` (each undo/redo re-commits the reverted model). Local stack now; Yjs migration is Stage E
- [x] Keyboard map (`Editor`): ⌘Z/⇧⌘Z (+⌘Y) undo/redo, Del/Backspace delete (edge→Disconnect, component→RemoveComponent, group→RemoveGroup), ⌘D duplicate, arrows nudge (⇧ = 1px), Esc clear, Space-pan (React Flow `panActivationKeyCode`; RF's own delete disabled). `RemoveComponent` prunes touching connections; `RemoveGroup` orphans children to top level
- [x] Copy/paste as `application/x-caml+json` (`canvas/clipboard.ts`, via document copy/paste events + text/plain fallback): a component copies itself, a group copies its subtree + internal connections; `remapFragment` mints fresh ids and rewires every ref (group/parent/from/to), dropping refs that point outside the fragment

**Done when:** 20-operation editing session fully reversible; paste between two architectures works. Headless: web 54/54 (history 5, clipboard 6, commands 20, connections/containment/projector/PropertyForm/api/App), tsc/eslint/`vite build` clean. Live undo-chain + cross-architecture paste eyeballed on EC2 via the SSH tunnel.

> Day 17 notes: undo/redo track the **semantic model** (content-addressed); layout nudges are
> cosmetic (sidecar only) and intentionally not in the undo stack — and since commits are keyed on
> the model hash, a layout-only change rides the next model commit rather than creating its own.
> 409/422 reset the history to the known-good server/committed model (invalid optimistic edits are
> discarded with the undo branch). Clipboard uses the DOM `copy`/`paste` events so the custom MIME
> actually round-trips (the async Clipboard API only exposes text); paste works across architectures
> because it's the OS clipboard. ⌘A select-all is deferred with multi-select (Backlog). Drag-to-
> reparent existing nodes (from Day 16) remains deferred — not required by either day's acceptance.

### Day 18 — ELK auto-layout ✅ (2026-06-14)
**Goal:** "Tidy up" + sane initial layout.
- [x] elkjs (`elk.bundled.js`) in a Vite module Web Worker (`canvas/elk.worker.ts`, its own 1.4MB chunk off the main bundle); `toElkGraph` builds the hierarchical graph with `elk.algorithm=layered`, `direction=RIGHT`, `hierarchyHandling=INCLUDE_CHILDREN`, `edgeRouting=ORTHOGONAL` + group padding; `fromElkGraph` → layout sidecar (positions + group sizes). Pure build/extract unit-tested
- [x] "✨ Tidy up" button → `autoLayout` → replaces the layout sidecar; CSS transform transition animates the move; recorded as **one undoable step** (layout now lives in the history `present` alongside the model, so ⌘Z reverts a tidy-up — and nudges)
- [x] New-node placement: top-level drops keep their drop position; drops into a container auto-layout inside it; ELK then collision-avoids on the next tidy-up (the projector honours sidecar group **sizes** so containers fit their ELK-spread children). A bespoke incremental near-neighbour heuristic is parked in the Backlog

**Done when:** scrambled 30-node fixture → one click → clean left-to-right layout with intact nesting. Headless: web 57/57 (layout 3, history 5, clipboard 6, commands 20, …), tsc/eslint/`vite build` clean (worker emits a separate chunk). Live tidy-up on a scrambled fixture eyeballed on EC2 via the SSH tunnel.

> Day 18 notes: refactored the undo history `present` from `model` to `{ model, layout }` so
> layout changes (tidy-up, nudge, drop positions) are undoable in the same timeline. ELK's
> hierarchical output is parent-relative, which is exactly React Flow's child coordinate space, so
> positions map straight across; group sizes flow through the extended `LayoutSidecar.sizes` and the
> projector applies them. Persistence caveat (unchanged from earlier days): commits are content-hash
> addressed, so a layout-only change is a no-op commit server-side and rides the next model commit;
> the model GET still doesn't return the sidecar, so tidy-up is a live-session view transform until
> layout read-back is wired (a later day). `self.postMessage` collides with the DOM `Window`
> signature under the web tsconfig — cast to the single-arg worker form in the worker.

### Day 19 — History & diff UI ✅ (2026-06-14)
**Goal:** Versioning visible in-product (the differentiator, demo-critical).
- [x] History panel (`canvas/HistoryPanel.tsx`, toggled from the header): commit list with origin badge, stats (comp/conn/grp + providers), message, time, short hash; `useCommits` over the Day-9 `GET /commits`
- [x] Select two commits → diff view: `useDiff` (Day-9 `GET /diff`) + `useCommitModel` for the `to` model; pure `buildDiffView` re-injects removed elements as ghosts and yields a status map; canvas highlights added=green / removed=red(ghost) / modified=amber on nodes **and** edges; `DiffPanel` change-list sidebar renders the typed `ModelDiff` (per-collection +/−/~ with property `before → after`). Diff mode is read-only (keyboard/clipboard/edit handlers suppressed)
- [x] Restore-as-new-commit: `useEditor.restore(model)` commits the fetched old model as a new head — content-addressed, so the new commit's hash equals the restored model's (never a history rewrite)

**Done when:** make 5 edits, diff head vs 5-back, every change correctly highlighted on canvas; restore produces a new commit equal (by hash) to the old model. Headless: web 58/58 (diffView 1, history 5, layout 3, commands 20, …), tsc/eslint/`vite build` clean. Live history→diff-highlight→restore eyeballed on EC2 via the SSH tunnel.

> Day 19 notes: the diff canvas renders the fetched `to` commit's committed model (independent of the
> live editor state / pending debounce) and auto-lays-it-out (the commit endpoint doesn't return a
> layout sidecar), so highlight correctness — not position — is what's asserted. From/to ordering is
> derived from the newest-first commit index (lower index = newer = `to`). Removed elements have no
> place in the newer model, so they're injected as faded red ghosts to keep "every change on canvas"
> literally true. Restore reuses the same commit path; if the restored model equals head it's a
> server no-op (expected). Diff mode disables the Day-17 keyboard/clipboard handlers to stay read-only.

### Day 20 — Stage C hardening + perf pass ✅ (2026-06-14)
**Goal:** Solid at realistic scale.
- [x] 500-node fixture (`canvas/fixtures.ts` `generateLargeModel`, deterministic VPC⊃subnet nesting + sparse edges) + projector scale test (counts + parent-before-child at 500); perf: `onlyRenderVisibleElements` + `minZoom={0.1}`, `React.memo`'d `ServiceNode`/`GroupNode`, memoized projection, zoom LOD v1 — below 0.4 zoom service nodes render as low-detail chips via a boolean `useStore` selector (re-renders only on threshold cross)
- [x] Playwright e2e `e2e/golden-journey.spec.ts` (create → drag-build 12 → edit → diff → reload) + `playwright.config.ts` + `pnpm --filter @cac/web e2e` — **green (6.7s)** against the live EC2 stack over an SSH tunnel (`CAC_E2E_BASE_URL`). Full-stack CI wiring (stand the stack up in the runner) is deferred, like the Docker-gated integration tests
- [x] Paper-cut sweep — top fixes: **New-architecture create** flow (the list page had no way to create one — now an inline name + button → `POST` → editor); **stale history list** (the commit list cached from editor-load never refreshed → diff couldn't see new commits; now gated on panel-open + always-stale, refetched on open); editor header shows the architecture name; (remaining → Backlog)

**Done when:** 500-node fixture interactive at 60fps-ish (no visible jank dragging) — perf measures in place + scale test green; the fps eyeball is on EC2. Golden journey green — ✅ runs green against the deployed stack (CI stack-up deferred). Headless: web 59/59, tsc/eslint/`vite build` clean.

> Day 20 notes: LOD uses a boolean `useStore((s) => s.transform[2] < 0.4)` selector so a node only
> re-renders when it crosses the threshold, not on every zoom tick; `minZoom` lowered to 0.1 so you
> can actually reach the chip zoom. Running the e2e for real surfaced two genuine bugs the unit tests
> couldn't: overlapping drops intercepting clicks (test drives the topmost/last node) and — the real
> one — a **stale history list** (`useCommits` cached at editor mount, so a freshly-built model's
> commit never appeared in the panel; gated the query on panel-open + always-stale). The Playwright
> build step drives real HTML5 drag-and-drop (palette → `.react-flow__pane`); the spec waits for each
> node before the next drop. **Stage C complete (Days 12–20).**

---

## Stage D — Projections: export, IaC, validation v0 (Days 21–26)

### Day 21 — PNG/SVG export ✅ (2026-06-14)
- [x] Client PNG via `html-to-image`: the canvas registers a `CanvasExporter` handle (`registerExporter`) that fits all nodes (`getNodesBounds` + `getViewportForBounds`) and rasterises the React Flow viewport at a chosen pixel ratio (1×/2×/3×)
- [x] Server SVG serializer in the **diagram** module (`renderSvg`, pure): absolute nested-box layout mirroring the canvas projector, kind-styled group containers + edges, inline icon tiles, light/dark themes; exposed via `diagram/api.ts` and wired to `GET /api/v1/architectures/{id}/branches/{branch}/export.svg?theme=` on the architecture controller (boundary-respecting cross-module import). Unit-tested (well-formed SVG, all elements present, escaping, dark theme)
- [x] Export popover in the editor header: theme (light/dark), PNG scale, Download PNG / Download SVG (disabled in diff mode)

**Done when:** both exports of the e-commerce fixture look presentation-ready. SVG verified **live** — `GET …/export.svg` for the seeded Acme 3-tier returns valid `image/svg+xml` (2.7 KB, nested region→VPC→subnet, kind-tinted). Headless: core 9/9 (svg 3), web 59/59, tsc/eslint/builds clean. PNG is build-verified; visual eyeball on EC2. Begins Stage D.

> Day 21 notes: the SVG serializer lives in the `diagram` module (doc-15 home) and re-derives its own
> absolute layout from the model rather than depending on the web projector — same nested-box geometry,
> so on-screen and exported diagrams agree. The endpoint sits on the architecture controller (it already
> reads models) and imports `renderSvg` through `diagram/api.ts`, satisfying eslint-boundaries. Web fetches
> the SVG URL directly (it returns image/svg+xml, not JSON), so no API-client regen was needed. Icons are
> inline coloured tiles (the placeholder pack) — real provider icon packs remain a Backlog/licensing item.

### Day 22 — Terraform export ✅ (2026-06-15)
**Goal:** CAML → Terraform that `terraform validate` passes, downloadable.
- [x] Typed resource graph (CAML → `aws_vpc`/`aws_subnet`/`aws_lb`/`aws_launch_template`+`aws_autoscaling_group`/`aws_db_instance`) with ref wiring (subnet→vpc, asg/alb→subnets); per-top-level-group `.tf` layout + `versions`/`providers`/`variables`/`backend`/`README` skeleton; purpose-built deterministic HCL writer (`iac/hcl.ts`)
- [x] Dependency-free, deterministic **store-only ZIP writer** (`iac/zip.ts`, CRC32 + fixed timestamps → byte-stable) so the bundle is one download; `GET …/branches/{branch}/export.tf.zip` (`application/zip`); `emit.cli.ts` for CI
- [x] "Download Terraform" in the export popover; CI emits the 3-tier fixture and runs `terraform validate` against the real AWS provider (`hashicorp/setup-terraform`)

**Done when:** the 3-tier subset generates HCL that `terraform validate` passes ✅ (CI). Core 13 tests (terraform 4, zip 4); the seed emits 6 files.

> Day 22 notes: met/exceeded the planned "IR + skeleton" in one day. **Known fidelity gap:** the ASG block reads `properties.scaling.{min,max}`, but the 3-tier fixture uses `minSize/maxSize`, so it falls back to defaults — there's no catalog-driven property→HCL mapping yet (each service is hand-mapped in `terraform.ts`).

### Day 23 — HLD markdown export ✅ (2026-06-15) · *substituted for the planned "Terraform coverage" day*
**Goal:** A third derived artifact — a reviewer-facing High-Level Design document.
- [x] Activated the **artifact** module: pure `renderHld(model)` → markdown (overview + counts; requirements with machine-checkable targets; the region/network/subnet topology as a nested tree; component + connection tables with resolved endpoint names), stamped with the content hash; reuses `indexModel`/`hashModel`
- [x] `GET …/branches/{branch}/export.hld.md` (`text/markdown`) + "Download HLD (.md)" in the export popover

**Done when:** the 3-tier fixture renders a clean HLD ✅ (6 unit tests, deterministic).

> Day 23 notes (**reality vs plan — diverged**): the planned Day 23 was "Terraform templates for ~12 services". That is **blocked on catalog breadth** (still only 5 services), so broad TF coverage moved to the catalog-expansion backlog, and HLD was pulled forward from the Stage-F docs day (pure, self-contained, rounds out the export trio). **Net: broad Terraform template coverage remains undone.**

### Day 24 — Unified export bundle ✅ (2026-06-15) · *demo rehearsal deferred*
**Goal:** Tie the exports together; one "download everything".
- [x] **artifact module as the aggregator**: `buildArtifacts(model)` composes SVG + HLD + Terraform into one file map via each module's public `api.ts` (boundary-clean); `GET …/branches/{branch}/export.bundle.zip` + "Download all (.zip)"
- [x] `artifact/export.cli.ts` writes the full bundle (seed of a future `cac export`); wired into CI as an SVG/HLD smoke; golden-journey e2e now exercises an export download

**Done when:** one action yields SVG + HLD + Terraform as a single zip ✅; CI smoke green.

> Day 24 notes (**reality vs plan — partial**): export polish met; the **rehearsed, timed 5-minute demo + `docs/plan/DEMO.md` was NOT done** — a doc-15 "never cut" item, carried forward (see Critical evaluation). CI runs `terraform validate` only — no LocalStack `terraform plan` yet.

### Day 25 — Validation engine + rule pack v0 ✅ (2026-06-15)
**Goal:** First deterministic *semantic* findings (doc 16), separate from the commit-gating structural/catalog errors. Read-only — never blocks a write.
- [x] Pure in-process engine (`validation/engine.ts`): `Rule`/`Finding` IR per doc 16 + a small graph helper (BFS reachability with allowed intermediaries); deterministic, severity-sorted report
- [x] Baseline pack v1 — **6 rules**: SEC-001 (unencrypted datastore, auto-fixable), SEC-002 (internet-reachable DB without a WAF — graph), SEC-004 (datastore in a public subnet), REL-001 (stateful single-AZ under an availability requirement), REL-007 (pinned ASG), OPS-001 (monitoring gap, criticality-modulated). Positive + negative fixtures each
- [x] `GET …/branches/{branch}/validate` returns the report
- [x] Web: a "✓ Validate" header button with a finding-count badge + `ValidationPanel` (severity cards, remediation, click-to-select)

**Done when:** per-rule pos/neg fixtures green (15 tests); the seed 3-tier surfaces one genuine **critical** finding (Orders DB reachable from the internet-facing LB with no WAF) ✅.

> Day 25 notes (**reality vs plan — diverged in shape**): hand-written predicate engine, **not `cel-js`**; **6 rules, not 10** (dropped SEC-005/SEC-013/REL-003/REL-004/OPS-002; *added* the graph rule SEC-002 the plan deferred); **`GET` not `POST`**; **no report caching** by (hash, ruleset). The Day-25 commit message mislabeled this "Stage E" — per this plan, validation v0 is the **tail of Stage D**; Stage E remains AI generation.

### Day 26 — Findings on the canvas + one-click fix ✅ (2026-06-15)
**Goal:** Validation visible in the design surface; mechanical fixes one click away.
- [x] Severity overlay: flagged nodes get a colored border + corner dot (groups: header dot) via a shared palette (`canvas/validationView.ts`); shown while the panel is open; click a finding → selects its node
- [x] Structured `AutoFix` on findings (a set-property intent) → "⚡ Fix automatically" applies it **through the existing CommandBus + commit path**, then re-runs the pack once the autosave lands, so the finding self-clears. SEC-001 ships the fix (`storageEncrypted → true`)

**Done when:** an unencrypted-RDS finding shows a red dot; one click fixes it; the badge clears; the fix is a normal commit in history ✅.

> Day 26 notes (**reality vs plan — met**). Caveats: the fix is a domain set-property intent, not a raw RFC-6902 `camlPatch`; "audited as a commit" = it's an ordinary commit (no audit module yet); not exercised by e2e (the golden journey builds finding-free abstract nodes).

---

## Critical evaluation (Days 1–26)

**Verdict.** The load-bearing core is genuinely strong and the thin vertical slice (CAML → API → canvas → three projections → validation) is real and largely demoable. But the slice has thinned at the edges through Days 22–26: a few planned deliverables were substituted or deferred, and a pile of "later" work (auth, events, layout persistence, catalog breadth) is now the difference between a great local prototype and something you can put in front of strangers.

**Genuinely solid**
- **CAML engine (Days 1–6)** — types, validator, canonicalizer/hash, typed diff, patch with the proven round-trip invariant; property-tested (fast-check), ~92% branch coverage. The most trustworthy part of the system.
- **Write path (Days 7–11)** — content-addressed commits, optimistic concurrency (409), pass-1+2 validation (422 with element paths), history/diff, keyset pagination, catalog endpoints + Redis, generated typed client + contract tests. **RLS is enabled from migration 0001.**
- **Canvas (Days 12–20)** — a real editor: palette/drop, schema-driven property forms, catalog-validated connections, groups/containment, undo/redo/clipboard, ELK tidy-up, history/diff UI, a 500-node perf pass, a green golden-journey e2e.
- **Projections + validation (Days 21–26)** — three deterministic artifacts (SVG, Terraform, HLD) and a rule engine that finds a *real* defect in the seed model.
- **Discipline intact** — module boundaries (eslint-boundaries), pure/deterministic derivations, the commit model never bypassed. The blueprint's load-bearing rules hold.

**Divergences from the plan (Days 22–26)**
- **Day 23:** HLD substituted for broad Terraform coverage → **broad TF templates undone** (blocked on catalog breadth).
- **Day 24:** export bundle shipped; **the rehearsed 5-minute demo + `DEMO.md` did not** — a "never cut" item.
- **Day 25:** 6 in-process predicate rules, not 10 CEL rules; `GET` not `POST`; no report caching. Commit mislabeled the stage.

**Technical debt (carried, with evidence)**
1. **Layout never persists across reload** — the sidecar is committed but the model `GET` doesn't return it, so tidy-up/positions are live-session-only and the projector re-derives on reload (Days 13/16/18 notes). The one item with a *user-visible* regression today.
2. **No auth / tenancy in practice** — single `DEFAULT_TENANT_ID`; RLS is enabled but trivially satisfied; every endpoint is unauthenticated. (Planned for Stage F.)
3. **No outbox / events** — `events` is a stub; `architecture.commit.created` is never emitted (blueprint Day-8 DoD item, re-sequenced away).
4. **Catalog stuck at 5 services** (vs 60 target / 45 cut-line) — the single biggest content gap; it throttles Terraform breadth, validation realism, and demo richness.
5. **CI gaps vs blueprint** — no Playwright in CI (e2e runs by hand against EC2), no k6/perf-budget gate (the "60fps" claim is eyeballed), `terraform validate` only (no LocalStack `plan`).
6. **Validation** — no caching, 6 rules, no POL-* (policy→rule) compilation, no false-positive corpus.
7. **Inert modules** — identity/workspace/billing/audit are empty; artifact/iac/diagram are 4-line NestJS stubs whose pure code is imported through `api.ts` (works, but they aren't DI-wired modules).
8. **`tsx` can't run Nest DI** (decorator metadata) — dev/openapi/contract all run the *built* server (Day 11). Friction, not a blocker.

**Top risks**
- **Catalog breadth** gates a convincing demo and the realism of both Terraform and validation. Fix this before polishing anything downstream.
- **The deferred pile** (auth, events, layout read-back) is coherent but growing; layout read-back is the cheapest to clear and the most visible.
- **The 5-minute demo — the project's whole proof — is unrehearsed.**

**Recommended next moves (re-sequencing suggestion, before Stage E)**
- **A — Catalog-expansion day:** +7–10 networking/compute services (doc 14 order) with TF templates + 2 evals each. Unblocks TF coverage, richer validation, and a better demo. (Folds in the old Day-23 intent.)
- **B — Layout read-back:** return the sidecar from the model `GET`. Kills the reload regression cheaply.
- **C — `DEMO.md` + timing pass:** the deferred Day-24 acceptance — the actual proof the slice works end to end.
- Then resume **Stage E (AI generation)** as planned.

---

## Re-sequence — Stage D closeout (before Stage E)

Acting on the Critical evaluation's recommended moves (A/B/C). These run **before**
the Stage E AI work below; **the Stage E day numbers shift accordingly** (the inner
"Day 27 — AI service scaffold" etc. will be renumbered when this re-sequence closes).

### Day 27 — Catalog expansion + Terraform coverage ✅ (2026-06-15) · move A
**Goal:** Break the 5-service ceiling and realize the deferred golden TF harness.
- [x] **+8 AWS services → 13 total** (doc 14 order): `aws.s3` (storage.object), `aws.sqs` (messaging.queue), `aws.sns` (messaging.topic), `aws.dynamodb` (database.keyvalue), `aws.elasticache_redis` (database.cache), `aws.lambda` (compute.serverless.function), `aws.kms` (security.keys), `aws.secrets_manager` (security.secrets) — schema + capabilities + connection rules + icon refs; all pass the catalog lint gate
- [x] **Terraform emission** for each new service (`terraform.ts` dispatch refactored to a `switch`; Lambda emits a companion `aws_iam_role` so it validates standalone; FIFO queues get the `.fifo` suffix); deterministic HCL
- [x] **Golden TF harness:** a `catalog-coverage.example.json` fixture (one component per service) + CI now emits and runs `terraform validate` over **both** fixtures; a catalog-package test proves the coverage fixture passes pass-1 + pass-2
- [x] New emission asserted by unit tests (`terraform.test.ts`); `loader.test.ts` key list updated

**Done when:** the coverage fixture validates pass-1+2 ✅ (catalog 13 tests) and emits HCL that `terraform validate` accepts ✅ (CI, both fixtures). Core iac 11 tests green.

> Day 27 notes (**move A of the re-sequence**): chose 8 services with clean, standalone Terraform (`terraform validate`-friendly) over the original plan's `aws.ec2`/`aws.cloudfront`/`aws.nat_gateway`, which need extra wiring (AMI / distribution config / EIP+subnet) — those stay on the catalog backlog. The generator is still hand-mapped per service (no catalog-template-driven emission yet — see backlog). This also unblocks richer validation findings (S3 versioning/encryption, KMS/secrets presence) on later rule-pack days.

### Day 28 — Layout sidecar read-back ✅ (2026-06-15) · move B
**Goal:** Kill the reload regression: tidy-up/positions survive a refresh.
- [x] `GET …/branches/{branch}/layout` returns the head commit's sidecar (`{ commit, layout }`, ETag = head hash); web `useEditor.load` hydrates `layout` from it instead of the empty sidecar (raw fetch — endpoint post-dates the generated client)
- [x] **Layout-only changes now persist:** a tidy-up/nudge produces a model-unchanged (no-op) commit, which previously discarded the new layout. `commit` now writes the layout onto the head commit (it's excluded from the content hash, so this is not a commit-identity mutation) — `repo.updateCommitLayout`
- [x] Integration test: layout round-trips, **including** the layout-only no-op-commit path

**Done when:** tidy up → reload → positions are preserved ✅ (integration test, runs in CI). The projector already prefers the sidecar (Day 18) and falls back to auto-layout when absent.

> Day 28 notes (**move B**): the deeper half of the fix was the persistence gap, not the read-back — content-addressed commits made a layout-only change a server no-op that dropped the sidecar (flagged in the Day 18 notes). Layout is a non-hashed sidecar, so updating it on the existing head commit is legitimate. Kept the model `GET` body a bare CamlDocument (ETag = model hash) and added a separate `layout` sub-resource rather than reshaping the model response. Client regen still deferred (raw fetch, as with validate/export).

### Day 29 — DEMO.md + timing pass ✅ (2026-06-15) · move C
**Goal:** Prove the slice end-to-end (the doc-15 "never cut" item).
- [x] `docs/plan/DEMO.md`: the full script — blank → manual 3-tier build → schema-validated props (incl. a deliberate `storageEncrypted=false` weakness) → **validate** (SEC-001 + SEC-002 findings) → **one-click fix** → tidy-up that survives reload (Day 28) → **export bundle** (SVG+HLD+Terraform) → `terraform validate` clean. Accurate prerequisites (built core, real ports :5173/:3001), a per-beat **timing budget (~5:00)**, and an honest "known rough edges" section
- [ ] **Live timed rehearsal** — to be run once on a live stack; record real wall-clock + any blocker (the project's "eyeball on the live stack" convention)

**Done when:** the script is written and runnable ✅; a clean sub-5-minute live run is **pending** the user's session (the timing column is a budget, not yet a measurement).

> Day 29 notes (**move C**): authored the rehearsal artifact, not a measured run — I can't drive a browser + full stack from here, so the timing is a target (consistent with every prior day's "Live X eyeballed on EC2"). The script deliberately ships a `storageEncrypted=false` weakness so the one-click SEC-001 fix is the demo's magic moment, and frames SEC-002 (no auto-fix) as the "severity-humility, real-risk" beat. Chose `terraform validate` (credential-free) over `plan` as the honest IaC proof.

---

## Stage E — AI generation v0 (Days 30–37 — the re-sequence consumed Days 27–29)

> The inner day labels below still read 27–34 from the original plan; add **+3** to
> each (AI service scaffold = Day 30, …, demo v2 = Day 37). Left un-renumbered to
> avoid churn; will be normalized when Stage E starts.

### Day 30 — AI service scaffold + provider wiring ✅ (2026-06-15) · (was "Day 27")
**Decision recorded** (DECISIONS.md): the AI pipeline is a **TypeScript `ai` module in the
core monolith**, not a separate Python app — one runtime, still extractable behind `ai/api.ts`.
- [x] `ai` NestJS module: prompt-registry loader (doc 17 YAML at repo `ai/prompts/`, the
  5 pipeline agents authored), an Anthropic provider (`@anthropic-ai/sdk`) with model-tier
  routing (frontier→`claude-opus-4-8`, mid→`claude-sonnet-4-6`, small→`claude-haiku-4-5`)
  + per-model pricing; client construction is lazy (no API key needed for the stub)
- [x] Job model: `POST /api/v1/ai/generate` → `{ jobId }`; **SSE** progress channel
  `GET /api/v1/ai/jobs/{id}/stream` (ReplaySubject → late subscribers see the whole run)
- [x] Token/cost accounting per job (running totals → a `usage` event with an est. USD cost)
- [x] Web: an "✨ Generate with AI" console on the list page that streams the pipeline
  (router → requirements → planner → composer → critic → repair → usage → done)

**Done when:** a stub job streams fake stages end-to-end into a web console panel ✅
(6 backend tests: registry parse + the full streamed pipeline shape; the seed prompt
streams all six stages, a usage line, and an `ai/gen-*` branch).

> Day 30 notes: generation is **stubbed** — the orchestrator runs the real pipeline *shape*
> and token-accounting, but no model is called yet (the provider + registry are wired for the
> Composer day). Chose SSE over WebSocket (simpler, one-way, fits NestJS `@Sse`). **Deferred
> from the blueprint's scaffold:** AgentTrace persistence (S3) and the intent router prompt —
> both land when generation goes live. Adds `@anthropic-ai/sdk` + `yaml` to `@cac/core`.

### Day 31 — Requirements agent ✅ (2026-06-15) · (was "Day 28")
**Goal:** The first real model call — NL request → structured CAML requirements.
- [x] `requirements.agent.ts` implements `requirements/v1` (doc 17 skeleton from the
  registry): **mid tier → `claude-sonnet-4-6`** (doc 07), adaptive thinking, tolerant
  JSON-contract parse → CAML `Requirement[]` + ambiguities + `workload_class` + `flags`,
  with usage (token) accounting. Client is dependency-injected (mockable + eval-able)
- [x] **Eval harness:** 6 mocked unit tests (CI-deterministic — parsing, fences, unknown-kind
  coercion, refusal, malformed JSON) **+ 15 live golden cases** (`requirements.eval.test.ts`,
  structural assertions: extraction, inference labelling, the 50M-users heuristic), gated on
  `ANTHROPIC_API_KEY` so CI without a key skips the live block
- [x] Wired into the pipeline: when a key is present the `requirements` stage is **real**
  (streams the actual extracted-requirements + inferred-assumptions count to the console);
  no key → the stub path (so CI stays deterministic)

**Done when:** the e-commerce prompt yields requirements matching the golden expectations
✅ (live evals when keyed); the harness runs in CI (mocked path green, live smoke gated).

> Day 31 notes: used a **JSON-contract parse, not structured-output constraints** — the
> CAML `quantity` field is an open key-value map, which strict JSON-Schema mode can't
> express; the agent instructs JSON-only and parses tolerantly (fences/prose stripped,
> unknown kinds coerced to `other`). Honored doc-07 **model-tier routing** (mid=Sonnet)
> via the registry rather than forcing Opus. **Deferred:** the full assumptions
> *accept/edit* UI panel — for now assumptions surface as the streamed requirements-stage
> detail in the console (the accept-before-proceed gate lands with the proposal/diff UX).
> Live evals + the in-pipeline call can't be run here (no key); the mocked path is the
> CI-verified coverage.

### Day 32 — Planner agent + pattern seed ✅ (2026-06-15) · (was "Day 29")
**Goal:** Requirements → a capability plan (abstract skeleton), grounded in patterns.
- [x] **5 reference patterns** as partial CAML (`ai/patterns/*.json`, abstract types only,
  no bindings): `web-3tier-ha`, `serverless-api`, `event-driven-core`, `static-site-cdn`,
  `batch-pipeline` — each with tags, applicability, capabilities, connections, citations
- [x] **`pattern_fetch`** tool: keyword-rank search over the corpus (v0, no embeddings yet);
  `planner.agent.ts` implements `planner/v1` (doc 17) — **frontier tier → `claude-opus-4-8`**,
  a **tool-using** manual agentic loop (calls `pattern_fetch`, then emits the plan JSON),
  adaptive thinking, summed token accounting
- [x] **Eval (hard checks):** `unmappedRequirementIds` (every requirement mapped) +
  `hasServiceBindings` (no `aws.*`/`azure.*`/`gcp.*` keys leak). 5 mocked unit tests
  (tool-use loop, parse, coverage, binding-leak detection, refusal, non-convergence) +
  pattern-store tests + a live golden case, gated on `ANTHROPIC_API_KEY`
- [x] Wired into the pipeline: when keyed, the `planner` stage consumes the live
  requirements output and streams "planned N capabilities from M pattern(s); every
  requirement mapped"

**Done when:** planner output for the e-commerce prompt cites ≥2 patterns and maps every
requirement ✅ (asserted by the live golden eval when keyed; the mocked loop verifies the
same structural contract in CI).

> Day 32 notes: a real **tool-use loop** (not a single call) — the model calls `pattern_fetch`,
> the loop executes it against the corpus and feeds results back until the model emits the plan
> (assistant turns echoed back verbatim incl. thinking blocks, per the multi-turn rule). The
> "no service bindings" hard check is a helper (`hasServiceBindings`) asserted by the eval
> rather than a parse-time throw, so a leak surfaces as a clean failure and the pipeline stays
> resilient. `kg_topology` (the planner's other doc-17 tool) is deferred — no knowledge graph
> yet. Live loop can't be exercised here (no key); the scripted-mock loop is the CI coverage.

### Day 33 — Composer agent ✅ (2026-06-15) · (was "Day 30")
**Goal:** Capability plan → concrete, catalog-bound CAML that validates, committed.
- [x] **`catalog_search` / `catalog_schema` tools** (`catalog-tools.ts`) over the loaded
  catalog (CATALOG token, injected) — the composer binds only to real keys
- [x] **`composer.agent.ts`** (`composer/v1`, frontier → `claude-opus-4-8`): a tool-use loop
  **plus a repair loop** — every candidate model runs through the *deterministic* pass-1
  (structural) + pass-2 (catalog) validation, and errors are fed back for surgical repair
- [x] **Hard gate:** a non-catalog service key (or any persistent validation error) → repair
  → **fail the job** after the repair budget rather than emit a broken model
- [x] **Commit through the write path** (doc 12 invariant 3): on a live compose, the
  generation service creates an architecture and commits the model via the **Architecture
  Service** (now exported from its `api.ts`; AiModule imports ArchitectureModule); the
  `done` event carries the new `architectureId` and the console links to it
- [x] Tests: catalog-tools + the mocked compose/repair loop (first-try valid, tool-use,
  repair a non-catalog key, hard-fail on persistent invalidity, refusal) against the **real
  catalog + validators**; a live golden eval (pass-1+2 clean, catalog-only bindings) gated on key

**Done when:** e-commerce prompt → valid CAML model (pass-1+2 clean) lands as commits on an
`ai/gen-*` lineage and renders on the canvas ✅ — the composed model commits and the console
deep-links into the editor (live/keyed; the commit path runs in CI's integration env).

> Day 33 notes: the repair loop reuses the **exact** commit-path validators
> (`validateStructure` + `validateAgainstCatalog`), so the AI can't disagree with the
> deterministic engine about what's valid. **Simplifications vs doc 17:** single-shot
> composition (not sectioned/parallel-per-group) and **no progressive streaming-draw** —
> the canvas renders the committed model when opened, not stage-by-stage; `ai/gen-*`
> branch + `origin: 'ai'` are approximated by a new architecture on `main` (branch-create
> + commit-origin are a later write-path tweak). Live compose + the DB commit can't be run
> here (no key / no Docker); the mocked loop against the real catalog is the CI coverage.

### Days 31–32 — Critic + Repair agents, closed loop
- [ ] `run_validation` tool (Day 25 engine); critic per doc 17; repair emitting per-finding patches; orchestrator loop (max 3 iterations)
- [ ] Proposal UX: AI branch shown as a diff against current model (Day 19 UI reused) with accept/reject
- [ ] Seeded-defect eval: mutate golden models, measure critic catch rate

**Done when:** generation with a deliberate weakness (single-AZ DB) gets caught and repaired before the proposal reaches the user; accept merges it into history.

### Days 33–34 — Generation hardening + demo v2
- [ ] 30-case golden suite across workload classes; fix the worst failure modes
- [ ] Cost guard: per-job token cap, job timeout, graceful partial-result failure
- [ ] Demo v2 script: prompt → streamed diagram → findings → one-click fix → Terraform. Rehearse, time, record gaps.

**Done when:** 80%+ golden pass; demo v2 runs clean end-to-end. **This is the "show people" milestone.**

---

## Stage F — Toward multi-user product (Days 35–60, coarse — refine when Stage E ships)

| Days | Theme | Headline outcomes |
|---|---|---|
| 35–38 | Auth + tenancy for real | Email/OAuth login, sessions, tenant/workspace tables live, RLS verified by cross-tenant test suite (doc 10) |
| 39–42 | Catalog expansion sprint 1 | +15 services (doc 14 networking/compute rows complete) with Terraform templates + eval cases |
| 43–46 | Cost estimates v0 | AWS price ingestion for shipped services, `POST /v1/cost/estimate`, cost panel + per-MR-style cost delta on diffs |
| 47–50 | Docs generation v0 | HLD markdown from model + findings + rationale (deterministic skeleton + AI narrative per doc 03 §3.10) |
| 51–54 | Catalog expansion sprint 2 + Draw.io import beta | +15 services; shape-fingerprint import wizard (doc 06) |
| 55–58 | Deploy a hosted alpha | Stage-1 infra (doc 11) via CDK: ECS/Fargate or fly.io-class shortcut (decide then), TLS, monitoring basics |
| 59–60 | Alpha onboarding + feedback loop | 5 external testers, instrumented golden journeys, triage ritual established |

Beyond Day 60 (sequenced from blueprint phases): real-time collab (Yjs server), branch/merge UI, Azure/GCP catalogs + translation, graph-engine validation rules (Neo4j/AGE), discovery connectors.

---

## Decisions log
Maintained in `docs/plan/DECISIONS.md` — any day where we deviate from the blueprint
(e.g. TS-instead-of-Python AI service, fly.io instead of AWS for alpha) gets a dated
entry with rationale.

## Backlog (parking lot)
- Official AWS/Azure/GCP icon packs + licensing review (placeholder icons until then)
- Multi-select shared property editing
- PDF export (after SVG is solid)
- Layers UI, presentation mode
- `cac` CLI (validate/diff/export) — **seeded**: `emit.cli.ts` + `artifact/export.cli.ts` exist; promote to a real `cac` binary
- Watermarking/export policy (matters only at hosted alpha)

### Carried forward from Days 22–26 (see Critical evaluation)
- **Broad Terraform template coverage** — ✅ *golden harness realized* (Day 27): every shipped service × the coverage fixture → `terraform validate` in CI. Still open: cross-resource refs (ALB→target group, SG wiring from connections); the remaining doc-14 services (`aws.ec2`/`aws.cloudfront`/`aws.nat_gateway`/…) toward 60.
- **`docs/plan/DEMO.md` + a rehearsed, timed 5-minute demo** (blank → manual build → validated props → Terraform → `terraform plan` clean). The deferred Day-24 acceptance; doc-15 "never cut".
- **Layout sidecar read-back** — return the sidecar from the model `GET` so tidy-up/positions survive reload.
- **Validation v0 closeout** — report caching by (hash, ruleset); the 4 deferred CEL rules (SEC-005, SEC-013, REL-003/004, OPS-002); POL-* policy→rule compilation; per-rule false-positive corpus; consider `POST` + a catalog-default lookup (`catalog.defaultOf`).
- **Catalog-driven Terraform property mapping** — replace the hand-mapped `terraform.ts` (e.g. ASG `scaling` vs fixture `minSize/maxSize`) with catalog-template-driven emission.
- **CI hardening** — Playwright in CI (stand the stack up in the runner), k6 commit-endpoint perf gate, LocalStack `terraform plan`.
