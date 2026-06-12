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

## Open — to be decided at the day indicated
- **Day 27:** AI service in Python (blueprint choice, doc 03) vs TypeScript module
  (one fewer runtime for a solo builder). Leaning TS until agent complexity demands
  the Python ecosystem.
- **Day 55:** Alpha hosting — blueprint Stage-1 AWS topology (doc 11) vs a
  fly.io/Railway-class shortcut for speed.
