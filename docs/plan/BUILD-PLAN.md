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

### Day 3 — Canonicalizer + content hashing
**Goal:** Deterministic identity for models (the commit primitive, doc 05).
- [ ] Canonicalizer: sorted keys, id-sorted arrays, layout/annotations excluded, stable number/string normalization
- [ ] SHA-256 `hashModel(doc)` over canonical form
- [ ] Property-based tests (fast-check): hash invariant under key order, array order, layout/annotation changes; hash *changes* on any semantic mutation

**Done when:** property tests pass over 1k generated permutations; two semantically identical docs with wildly different formatting hash identically.

### Day 4 — Typed diff
**Goal:** `diffModels(a, b) → ModelDiff` (doc 02 value object).
- [ ] Id-anchored matching → ComponentAdded/Removed/Modified (deep property path diffs), same for connections/groups/policies/requirements
- [ ] Human-readable diff summary renderer ("~ orders-db: properties.multiAz false → true")
- [ ] Fixture suite: 12 curated before/after pairs covering every change class

**Done when:** every fixture produces the expected typed change set; summary output reads like a sane PR description.

### Day 5 — Patch apply/invert + round-trip guarantee
**Goal:** The mutation primitive the canvas, AI, and merge all use.
- [ ] RFC-6902 apply with CAML-aware validation post-apply; patch inversion
- [ ] `applyDiff(a, diff(a,b)) ≡ b` property test over generated model pairs
- [ ] `caml` package README: API surface + invariants (this package gets the doc 15 "most-tested" treatment)

**Done when:** round-trip property test green over 1k pairs; package coverage > 90% branches.

### Day 6 — Catalog format + first 5 services
**Goal:** Catalog-as-code pipeline exists (doc 14 format).
- [ ] `catalog/` layout: `services/aws/*.yaml`, JSON Schema for the catalog format itself, lint script
- [ ] Author 5 services end-to-end minus IaC templates: `aws.vpc`, `aws.subnet`, `aws.alb`, `aws.ec2_asg`, `aws.rds` (schema + capabilities + connection rules + icon refs)
- [ ] Loader in `packages/caml` (or new `packages/catalog`): load + validate catalog, expose typed lookup
- [ ] Pass-2 validation wired: component properties checked against bound service schema

**Done when:** the doc 05 example model passes pass-1 + pass-2 validation against the seed catalog; a bogus property (`instanceClass: "huge"`) is rejected with a catalog-sourced message.

---

## Stage B — System of record: API + persistence (Days 7–11)

### Day 7 — Core app skeleton + DB migrations
**Goal:** NestJS modular monolith with the doc 15 module layout and the doc 04 core tables.
- [ ] Modules scaffolded: `architecture`, `catalog`, `events` (others stubbed); eslint-boundaries rule enforcing public-api-only imports
- [ ] Migrations (Drizzle or TypeORM + raw SQL): `architectures`, `model_commits`, `branches` exactly per doc 04 (incl. RLS policies, even though single-tenant locally — `tenant_id` defaulted)
- [ ] Config, health endpoint, OpenAPI setup, request logging

**Done when:** `pnpm dev:core` boots against docker Postgres; migrations apply cleanly twice (idempotence); `/health` and `/docs` (Swagger) respond.

### Day 8 — Architecture endpoints: create / commit / read
**Goal:** The sacred write path (doc 12 invariant 3).
- [ ] `POST /v1/architectures` (creates default branch + empty initial commit)
- [ ] `POST .../branches/{branch}/commits` — full-model or patch body, optimistic lock on `expectedParent` (409), pass-1+2 validation (422 with element paths), canonical hash, layout sidecar
- [ ] `GET .../branches/{branch}/model` with ETag = head hash; `GET .../commits/{hash}` (immutable, cache headers)

**Done when:** integration tests (testcontainers Postgres): happy path, stale-parent 409 under concurrent commits, invalid model 422; committing the doc 05 example returns a stable hash across runs.

### Day 9 — History + diff endpoints
**Goal:** Versioning is visible.
- [ ] `GET .../commits` (paginated history) ; `GET .../diff?from=&to=` returning the Day 4 typed diff
- [ ] Commit `stats` computed on write (component/connection counts, providers)
- [ ] Seed script: loads 3 fixture architectures with multi-commit histories (demo + test data)

**Done when:** diff endpoint output matches the caml-package diff for seeded histories; seed script is rerunnable.

### Day 10 — Catalog service endpoints + Redis cache
**Goal:** The palette's data source.
- [ ] Catalog publish-on-boot: load `catalog/` → Postgres tables + Redis cache
- [ ] `GET /v1/catalog/services?q=&provider=` (search), `GET /v1/catalog/services/{key}` (full schema for property forms)
- [ ] Icon static serving pipeline (start with placeholder set; official icon packs tracked in Backlog)

**Done when:** search returns ranked results for "load balancer"; service detail returns the property JSON Schema the form generator will consume.

### Day 11 — Generated API client + contract tests
**Goal:** Frontend never hand-writes fetch calls.
- [ ] OpenAPI spec emitted from NestJS decorators; `packages/api-client` generated (openapi-typescript + thin wrapper)
- [ ] Contract test: client against running core app for the Day 8–10 surface
- [ ] CI updated: spin Postgres service container, run integration + contract suites

**Done when:** `apps/web` can import a typed client and fetch a model; CI green end-to-end.

---

## Stage C — The canvas (Days 12–20)

### Day 12 — Canvas shell
**Goal:** React Flow renders a CAML model read-only.
- [ ] `apps/web` routes: architecture list → editor; TanStack Query wiring to api-client
- [ ] Projector v1: CAML + layout → React Flow nodes/edges (doc 06 derivation layer)
- [ ] `ServiceNode` (icon, name, binding badge) + basic edge rendering; pan/zoom/minimap/fit-view

**Done when:** seeded e-commerce fixture renders correctly from the API; refreshing loses nothing.

### Day 13 — Palette + drop-to-create
**Goal:** First mutation through the real write path.
- [ ] Palette panel: catalog search, grouped by abstract type, drag source
- [ ] CommandBus v1 (doc 06): `AddComponent` command → local CAML doc mutation → debounced commit to API (autosave = micro-commits)
- [ ] Optimistic UI + rollback on 409/422; save-state indicator (saved / saving / conflict)

**Done when:** drag `aws.alb` onto canvas → node appears instantly → network tab shows a commit → reload shows it persisted.

### Day 14 — Selection + property panel (the schema-driven form)
**Goal:** Edit any service's properties with zero per-service UI code (doc 06).
- [ ] JSON-Schema-driven form generator: string/number/boolean/enum/object fields, defaults, validation messages from pass-2
- [ ] `SetProperty` / `Rename` commands; inspector shows abstract type, binding, group
- [ ] Multi-select basics (shared property editing deferred to Backlog)

**Done when:** changing `aws.rds → multiAz` via the form round-trips to a commit; an invalid value is rejected inline with the catalog message.

### Day 15 — Connections
**Goal:** Drawing edges that mean something.
- [ ] Connect interaction (drag from handle); `Connect` command; connection kind picker (traffic/data/async) with smart default from catalog `connectionRules`
- [ ] Invalid targets visually rejected during drag (rules from catalog)
- [ ] Kind-styled edges (solid/dashed/dotted + color per doc 06); edge property panel (protocol, port, encrypted)

**Done when:** ALB→ASG (traffic) allowed, ALB→RDS (data) rejected with explanation; edge properties persist.

### Day 16 — Groups & containment
**Goal:** VPC ⊃ subnet ⊃ instance nesting works.
- [ ] `GroupNode` (React Flow parent nodes, `extent: 'parent'`, auto-size to children + padding, kind-styled headers)
- [ ] Create group from palette (network/subnet/region/zone); drag component into/out of group → `MoveToGroup` command
- [ ] Containment validation surfaced (subnet must live in network, etc.)

**Done when:** rebuild the doc 05 example from scratch by hand in < 10 minutes, visually correct nesting, persisted.

### Day 17 — Undo/redo + keyboard + clipboard
**Goal:** It feels like a real editor.
- [ ] Command history with semantic grouping (drag = one entry); undo/redo (local stack now; Yjs migration is Stage E)
- [ ] Keyboard map: ⌘Z/⇧⌘Z, Del, ⌘D duplicate, arrows nudge, ⌘A, Esc, Space-pan
- [ ] Copy/paste as `application/x-caml+json` fragment with id re-mapping on paste

**Done when:** 20-operation editing session fully reversible; paste between two architectures works.

### Day 18 — ELK auto-layout
**Goal:** "Tidy up" + sane initial layout.
- [ ] elkjs in a Web Worker; layered algorithm, `INCLUDE_CHILDREN`, orthogonal routing (doc 06 config)
- [ ] "Tidy up" button → animated transition → layout saved to sidecar (undoable)
- [ ] New-node placement heuristic (near neighbors, inside group, collision-avoided)

**Done when:** scrambled 30-node fixture → one click → clean left-to-right layout with intact nesting.

### Day 19 — History & diff UI
**Goal:** Versioning visible in-product (the differentiator, demo-critical).
- [ ] History panel: commit list (message, origin badge, stats, time)
- [ ] Select two commits → diff view: changed elements highlighted on canvas (green/red/amber) + change-list sidebar from typed diff
- [ ] Restore-as-new-commit ("rollback" per the brief — never history rewrite)

**Done when:** make 5 edits, diff head vs 5-back, every change correctly highlighted on canvas; restore produces a new commit equal (by hash) to the old model.

### Day 20 — Stage C hardening + perf pass
**Goal:** Solid at realistic scale.
- [ ] 500-node generated fixture; profile; memoized projector, `onlyRenderVisibleElements`, zoom LOD v1 (chips below 0.4)
- [ ] Playwright e2e: the golden journey (create → build 12-component app → edit → diff → reload)
- [ ] Bug sweep from dogfooding; UX paper cuts list triaged (fix top 5, rest to Backlog)

**Done when:** 500-node fixture interactive at 60fps-ish (no visible jank dragging); golden journey green in CI.

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
