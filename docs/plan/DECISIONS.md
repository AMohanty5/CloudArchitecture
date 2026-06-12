# Decisions Log

Dated record of deviations from the blueprint (`docs/blueprint/`) and decisions the
blueprint left open. One entry per decision: context, decision, rationale, revisit-when.

---

## 2026-06-12 — Solo-build re-sequencing of Phase 1
**Context:** Blueprint doc 15 assumes an 8-person funded team over 6 months.
**Decision:** Build a thin vertical slice solo-with-AI per `BUILD-PLAN.md`: CAML engine →
API → canvas → Terraform → validation v0 → AI generation v0, deferring auth/billing/
multi-tenant hardening to Stage F. Validation engine pulled forward from Phase 3 (10 CEL
rules) because it strengthens the core demo cheaply.
**Rationale:** Fastest path to a demoable, opinion-forming artifact; nothing built
violates the load-bearing rules (commit-only write path, module boundaries,
catalog-as-code), so the team plan stays valid if hiring happens.
**Revisit when:** First external users or first hire.

## 2026-06-13 — Persistence: raw SQL migrations + `pg`, not an ORM (Day 7)
**Context:** Build plan offered Drizzle or TypeORM + raw SQL for the core tables.
**Decision:** Use the `pg` driver directly with hand-written, embedded SQL migrations
(ordered TS array, tracked in `schema_migrations`, applied on boot + via a CLI). No ORM
for now; typed query helpers per table will live in the architecture module.
**Rationale:** doc 04 leans on Postgres-native features (RLS policies, JSONB, `CHAR(64)[]`,
later pgvector/AGE) that are clearer as raw SQL than through ORM abstractions; one fewer
abstraction for a solo build; migrations embedded as TS so they ship in `dist` and run
identically under tsx/node. Idempotence comes from the runner, not the DDL.
**Revisit when:** query volume/complexity makes typed query-building (Drizzle) pay for
itself, or when a non-owner DB role is introduced and RLS must actually bite.

## Open — to be decided at the day indicated
- **Day 27:** AI service in Python (blueprint choice, doc 03) vs TypeScript module
  (one fewer runtime for a solo builder). Leaning TS until agent complexity demands
  the Python ecosystem.
- **Day 55:** Alpha hosting — blueprint Stage-1 AWS topology (doc 11) vs a
  fly.io/Railway-class shortcut for speed.
