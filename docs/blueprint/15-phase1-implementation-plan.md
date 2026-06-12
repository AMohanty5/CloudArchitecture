# 15 — Phase 1 Implementation Plan (Months 0–6)

This is the document the team opens on day one. It translates the blueprint into a
repository layout, epic breakdown, sprint sequence, and definitions of done.

## Repository & Project Setup

**Monorepo** (pnpm workspaces + Turborepo; Python and Go packages co-located):

```
cloudarchitect/
├── apps/
│   ├── web/                  # React SPA (Vite)
│   └── core/                 # NestJS modular monolith (all P1 backend modules)
├── packages/
│   ├── caml/                 # ⭐ CAML types, schema, canonicalizer, hasher, differ, patcher
│   │                         #    Pure TS, zero deps on app code. Shared web+core. Most-tested package.
│   ├── catalog-types/        # Generated types from catalog schemas
│   ├── ui/                   # Design system (Radix + Tailwind)
│   ├── api-client/           # Generated TS client (OpenAPI + GraphQL codegen)
│   └── config/               # Shared eslint/tsconfig/vitest presets
├── catalog/                  # ⭐ Catalog-as-code: services/aws/*.yaml, icons/, templates/
│   └── tools/                # Lint, golden tests, publish pipeline
├── schemas/                  # caml-1.0.schema.json (published artifact)
├── ai/                       # Python: orchestrator + agents (Phase 2; scaffolded in P1)
├── infra/                    # CDK app for our own AWS infra (Stage-1 topology, doc 11)
└── e2e/                      # Playwright suites
```

**Core monolith module layout** (NestJS modules = future service boundaries, doc 03):

```
apps/core/src/modules/
  identity/  workspace/  architecture/  diagram/  catalog/
  validation/  iac/  artifact/  billing/  audit/  events/ (outbox + SQS publisher)
```

Module rule enforced by lint (eslint-boundaries): modules import each other **only via
their public `api.ts`** or events — never internals. This is what keeps Phase 3
extraction a deploy change.

## Epic Breakdown

### E1 — CAML Core Library (`packages/caml`) — 2 eng, sprints 1–3 ⭐ critical path
- Types generated from `schemas/caml-1.0.schema.json` + handwritten ergonomics layer
- Canonicalizer (sorted keys, id-sorted arrays, layout/annotations excluded) + SHA-256 hasher
- Structural validator (ajv, compiled, friendly error mapping to element paths)
- `ModelDiff` (id-anchored, typed change set) and RFC-6902 patch apply/invert
- Group containment validation (acyclic, depth ≤ 8, kind-nesting rules)
- **DoD**: 100% branch coverage on differ/canonicalizer; property-based tests
  (fast-check): `hash(canon(x))` stable under key order/array order permutations;
  `apply(diff(a,b), a) ≡ b` round-trip on 1k generated models.

### E2 — Architecture Service module — 2 eng, sprints 2–5
- Tables: `architectures`, `model_commits`, `branches` (doc 04) + RLS from the first migration
- Endpoints: create / get model (ETag) / commit (optimistic lock, Idempotency-Key) /
  history / diff (doc 08)
- Linear history only in P1 (single `main`, commits append; branch/merge UI is P2 —
  but the **data model ships branch-ready now**)
- Outbox → SQS `architecture.commit.created`
- **DoD**: 409-on-stale-parent race test under concurrency; cross-tenant access test
  suite (every endpoint × foreign tenant token ⇒ 404); commit p99 < 150ms @ 40KB model.

### E3 — Identity, Workspace, Billing — 1 eng, sprints 1–4
- Email+password (Argon2id) + Google/GitHub OIDC; JWT issuance + refresh rotation
- Tenants/workspaces/role assignments; Cerbos embedded, 4 roles (viewer/editor/architect/admin)
- Stripe: Free/Pro plans, seat counting, entitlement checks (architecture count gate)
- **DoD**: token family reuse-detection test; SCIM/SAML explicitly out (P5/WorkOS later,
  but `auth_method` claim shaped for it now).

### E4 — Catalog v1 — catalog engineer + 1 backend, sprints 1–6 (continuous)
- Authoring format + lint + publish pipeline (doc 14); Catalog Service module
  (search/get/schema endpoints, Redis-cached)
- 60 AWS services per doc 14 sequence: networking first (they're the groups the canvas
  needs), then compute, data, messaging, security/ops
- **DoD per service**: doc 12 invariant 1 (schema+icon+TF+CDK templates+cost dims+2 evals)
- Sprint cadence: ~10 services/sprint after pipeline lands in sprint 2.

### E5 — Canvas — 2 frontend, sprints 1–6 ⭐ the other critical path
- Sprint 1–2: React Flow shell — viewport, palette (catalog search), drop-to-create,
  ServiceNode/GroupNode renderers, selection, property panel (JSON-Schema form generator)
- Sprint 3: connections (kind-styled edges, connection rules from catalog driving valid
  drop targets), containment (drag into group, auto-size), copy/paste, delete
- Sprint 4: CommandBus + undo/redo (local Yjs doc, single-user in P1 — **wire format is
  Yjs now** so P3 collab is a server, not a rewrite); keyboard map; ⌘K palette
- Sprint 5: ELK tidy-up (worker), zoom LOD, 1k-node perf pass; autosave → commits
  (debounced, squash on idle)
- Sprint 6: polish, Playwright interaction suite, usability-test fixes
- **DoD**: 60fps interaction @ 1,000 nodes on reference laptop; full keyboard map; zero
  truth in canvas state (kill the tab mid-edit, reload, nothing lost beyond debounce window).

### E6 — Exports & Terraform — 1 full-stack + catalog eng, sprints 3–6
- PNG (client) sprint 3; SVG/PDF (server, headless Chromium pool) sprint 4–5
- Terraform generation: typed IR from CAML → per-service Handlebars templates → module
  layout + variables + backend stub + README; golden tests run `terraform validate` +
  `plan` against LocalStack in CI
- Draw.io import (beta): shape-fingerprint table for AWS library, low-confidence wizard
- **DoD**: every catalog service's template passes `terraform validate`; demo flow
  (blank → 12-component web app → Terraform → `terraform plan` clean) under 5 minutes.

### E7 — Platform & Ops — EM/architect + rotating, sprints 1–6
- CDK Stage-1 infra; GitHub Actions (lint/test/build/deploy, OIDC); per-PR preview envs
- OTel wiring, structured logs, Sentry; audit_events table + interceptor
- Seed/demo data, fixture architectures for tests and sales demos
- **DoD**: main → production in < 15 min; rollback runbook tested; on-call rotation live
  by GA.

## Sprint Map (2-week sprints)

| Sprint | Milestone |
|---|---|
| S1 | Repo+CI+infra skeleton · CAML types+validator · auth MVP · canvas shell · catalog pipeline |
| S2 | Commit/hash/diff lib done · Architecture endpoints · palette+drop+property forms · first 8 services |
| S3 | **Internal demo: draw a VPC/ALB/ASG/RDS app, saved as commits** · connections+groups · PNG export · 20 services |
| S4 | Undo/redo+commands · history UI (linear) · SVG export · Terraform IR+first templates · 32 services |
| S5 | **Private beta (design partners)**: autosave, tidy-up, perf pass · TF golden suite green · billing live · 46 services |
| S6 | Draw.io import beta · PDF export · polish from beta feedback · 60 services · **Public launch** |

## Working Agreements

- **Trunk-based**, PRs < 400 lines preferred, two reviews on `packages/caml` and any
  tenant-boundary code, one elsewhere; feature flags over long branches.
- **Testing pyramid**: caml/catalog = exhaustive unit+property tests; modules =
  integration tests against real Postgres (testcontainers); e2e = the 6 golden user
  journeys, run on every merge.
- **Performance budgets in CI**: canvas interaction trace (Playwright + CDP) and commit
  endpoint k6 check fail the build on regression > 15%.
- **Weekly usability test** from sprint 3 (5 external architects, recorded, EM owns).
- **Demo Friday**: every sprint ends demoing the real product, no slides.

## Phase 1 Cut Lines (pre-agreed, in order)

If the schedule slips, cut in this order — never quality of what ships:
1. Draw.io import → P2
2. PDF export (keep PNG/SVG) → P2
3. Catalog 60 → 45 services (keep the doc 14 networking/compute/data core)
4. CDK templates (keep Terraform) → P2

**Never cut**: CAML round-trip integrity, RLS/tenant tests, commit immutability, the
5-minute demo flow. These are the company.
