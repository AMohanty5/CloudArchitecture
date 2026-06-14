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
- [~] Playwright e2e `e2e/golden-journey.spec.ts` (create → build 12 → edit → diff → reload) + `playwright.config.ts` + `pnpm --filter @cac/web e2e` — **authored**; runs against a deployed stack (`CAC_E2E_BASE_URL`), CI execution deferred (needs the full stack stood up, like the Docker-gated integration tests). Not yet green-in-CI
- [x] Paper-cut sweep — top fixes: **New-architecture create** flow (the list page had no way to create one — now an inline name + button → `POST` → editor); editor header shows the architecture name; (remaining paper cuts → Backlog)

**Done when:** 500-node fixture interactive at 60fps-ish (no visible jank dragging) — perf measures in place + scale test green; the fps eyeball is on EC2. Golden journey green in CI — **partially**: the journey is authored and runnable against the deployed stack; CI wiring/execution is deferred. Headless: web 59/59, tsc/eslint/`vite build` clean.

> Day 20 notes: LOD uses a boolean `useStore((s) => s.transform[2] < 0.4)` selector so a node only
> re-renders when it crosses the threshold, not on every zoom tick; `minZoom` lowered to 0.1 so you
> can actually reach the chip zoom. The Playwright build step drives real HTML5 drag-and-drop
> (palette → `.react-flow__pane`), which React Flow + native DnD can make timing-sensitive — the
> spec waits for each node before the next drop. I can't run a browser e2e in this environment, so
> it's authored-not-executed; honest status above. The create flow was a genuine dogfooding gap —
> the seeded list had no "new" affordance at all. **Stage C feature work complete (Days 12–20).**

---

## Stage D — Projections: export + IaC (Days 21–26)

### Day 21 — PNG/SVG export
- [ ] Client PNG (html-to-image of viewport, 2x scale)
- [ ] Server SVG serializer from projected graph (true vectors, embedded icons) as a `core` module endpoint
- [ ] Export menu with size/theme options

**Done when:** both exports of the e-commerce fixture look presentation-ready.

### Day 22 — Terraform IR + generator skeleton
- [ ] Typed IR: CAML → resource graph with provider blocks, refs, dependencies (doc 03 §3.9)
- [ ] Module layout strategy (per-group), variables file, backend stub, README generation
- [ ] Templates for Day 6's 5 services

**Done when:** e-commerce subset generates HCL that `terraform validate` passes (local terraform in CI via setup action).

### Day 23 — Terraform coverage for the working catalog
- [ ] Templates for every catalog service shipped so far (target ≈ 12 by now: + `aws.ec2`, `aws.lambda`, `aws.sqs`, `aws.s3`, `aws.cloudfront`, `aws.elasticache_redis`, `aws.nat_gateway`)
- [ ] Golden test harness: every service × minimal model → `terraform validate` in CI
- [ ] Cross-resource references (ALB→ASG target group, SG wiring from connections)

**Done when:** golden suite green for all shipped services; connection-driven security group rules appear in output.

### Day 24 — Export polish + the 5-minute demo
- [ ] "Export Terraform" UI: bundle preview (file tree + code view), zip download
- [ ] Demo script (`docs/plan/DEMO.md`): blank → prompt-less manual build → validated props → Terraform → `terraform plan` clean — rehearsed and timed
- [ ] Record the gaps the rehearsal exposes; fix blockers

**Done when:** you can run the 5-minute demo flow without touching a workaround.

### Day 25 — Validation engine v0
**Goal:** First deterministic findings (pulled forward from Phase 3 because it demos brilliantly).
- [ ] CEL evaluator (cel-js) over flattened model; rule format per doc 16
- [ ] Implement 10 rules: SEC-001, SEC-004, SEC-005, SEC-013, REL-001, REL-003, REL-004, REL-007, OPS-001, OPS-002 (all `cel`-engine, no graph DB needed yet)
- [ ] `POST /v1/validate` + report caching by (hash, ruleset)

**Done when:** fixture suite per rule (3 pos / 3 neg) green; intentionally-broken model returns the expected findings.

### Day 26 — Findings in the canvas
- [ ] Validation badges on nodes (severity color), findings panel with remediation text
- [ ] SEC-001's one-click `camlPatch` fix wired through CommandBus (undoable, audited as a commit)
- [ ] Re-validate on commit (debounced), live badge updates

**Done when:** unencrypted RDS shows a red badge; one click fixes it; badge clears; history shows the fix commit.

---

## Stage E — AI generation v0 (Days 27–34)

### Day 27 — AI service scaffold + provider wiring
- [ ] `ai/` Python FastAPI app (or TS module if we decide to defer Python — decide today, record in DECISIONS.md): Anthropic SDK, prompt registry loader (doc 17 format), AgentTrace logging to disk/S3-compatible store
- [ ] Job model: `POST /v1/ai/generate` → job id; SSE/WS progress channel
- [ ] Token/cost accounting per job

**Done when:** a stub job streams fake stages end-to-end into a web console panel.

### Day 28 — Requirements agent
- [ ] Implement `requirements/v1` per doc 17 skeleton; output contract enforced (structured output)
- [ ] 15 golden eval cases (extraction + inference + the 50M-users heuristic) in a pytest/vitest eval harness
- [ ] Assumptions surfaced in UI panel (accept/edit before generation proceeds)

**Done when:** the e-commerce prompt yields requirements matching the golden expectations; eval harness runs in CI (mocked + 1 live smoke).

### Day 29 — Planner agent + pattern seed
- [ ] Author 5 reference patterns as partial CAML (`web-3tier-ha`, `serverless-api`, `event-driven-core`, `static-site-cdn`, `batch-pipeline`)
- [ ] `pattern_fetch` tool (simple embedding or keyword search over patterns to start); planner per doc 17
- [ ] Eval: every requirement mapped; no service bindings in output (hard check)

**Done when:** planner output for the e-commerce prompt cites ≥2 patterns and maps every requirement.

### Day 30 — Composer agent
- [ ] `catalog_search` / `catalog_schema` tools against our catalog API; composer per doc 17 with constrained CAML output + repair loop on schema errors
- [ ] Sectioned generation (groups → components → connections → policies) streaming partial CAML
- [ ] Hard gate: non-catalog service key = automatic repair → fail job if persistent

**Done when:** e-commerce prompt → valid CAML model (pass-1+2 clean) lands as commits on an `ai/gen-*` lineage and renders progressively on the canvas.

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
- `cac` CLI (validate/diff/export) — natural after Day 25
- Watermarking/export policy (matters only at hosted alpha)
