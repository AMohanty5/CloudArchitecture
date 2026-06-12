# Cloud Architect Copilot — Technical Blueprint

> **Series A technical blueprint.** Enterprise SaaS for designing, validating, optimizing,
> documenting, and deploying cloud architectures across AWS, Azure, and GCP.
> Status: Design-complete, pre-implementation. Last updated: 2026-06-12.

## Document Map

| # | Document | Covers |
|---|----------|--------|
| 00 | [Executive Summary](00-executive-summary.md) | Vision, market, moat, core technical bets |
| 01 | [Product Architecture](01-product-architecture.md) | System-of-systems view, planes, event backbone, data flows |
| 02 | [Domain Model (DDD)](02-domain-model-ddd.md) | Bounded contexts, aggregates, entities, value objects, context map |
| 03 | [Service Architecture](03-service-architecture.md) | Every microservice: responsibility, API surface, events, scaling |
| 04 | [Database Design](04-database-design.md) | PostgreSQL, graph DB, vector DB, Redis, object storage; full schemas |
| 05 | [Architecture DSL](05-architecture-dsl.md) | CAML — the cloud-agnostic architecture modeling language; full JSON Schema |
| 06 | [Canvas Architecture](06-canvas-architecture.md) | React Flow + ELK.js rendering stack, CRDT collaboration, tradeoffs |
| 07 | [AI Architecture](07-ai-architecture.md) | Agent orchestration, RAG, knowledge graph, validation/cost/security agents |
| 08 | [API Design](08-api-design.md) | REST, GraphQL, WebSocket specs with example endpoints |
| 09 | [Cloud Discovery](09-cloud-discovery.md) | Secure AWS/Azure/GCP connection, resource discovery, digital twin & drift |
| 10 | [Security Architecture](10-security-architecture.md) | AuthN/AuthZ, RBAC, encryption, secrets, audit, tenant isolation |
| 11 | [Deployment Architecture](11-deployment-architecture.md) | MVP → Production → Enterprise topologies |
| 12 | [Development Roadmap](12-roadmap.md) | 5 phases: features, team, timeline, risks |
| 13 | [Build vs Buy](13-build-vs-buy.md) | Every major component: build/buy decision with rationale |
| 14 | [Catalog Seed](14-catalog-seed.md) | The Phase 1 60 AWS services + full AWS↔Azure↔GCP equivalence map with fidelity scores |
| 15 | [Phase 1 Implementation Plan](15-phase1-implementation-plan.md) | Repo layout, epics, sprint map, definitions of done, cut lines |
| 16 | [Validation Rule Pack](16-validation-rule-pack.md) | Rule format, the full v1 inventory (~150 rules), 8 fully-specified reference rules |
| 17 | [Prompt Registry](17-prompt-registry.md) | Registry format, tool contracts, production prompt skeletons for the 5 generation agents, eval gates |
| 18 | [Investor Deck Outline](18-investor-deck-outline.md) | 15-slide Series A narrative mapped back to blueprint docs |

Normative schema artifact: [`/schemas/caml-1.0.schema.json`](../../schemas/caml-1.0.schema.json) — the full CAML 1.0 JSON Schema including the complete abstract-type taxonomy.

## How to Read This

- **Engineers starting implementation**: read 05 (DSL) first — it is the spine of the product.
  Then 02 → 03 → 04 → 08.
- **Investors / leadership**: 00 → 01 → 12.
- **Security reviewers**: 09 → 10.
- **Frontend team**: 06 → 08 → 05.
- **AI team**: 07 → 05 → 04.

## The Three Load-Bearing Decisions

1. **The Architecture DSL (CAML) is the product.** Diagrams, IaC, docs, cost, validation,
   and cloud sync are all *projections* of one canonical, versioned, cloud-agnostic model.
   We never store "a diagram" — we store a model and render diagrams from it.
2. **Git-like versioning from day one.** Architectures are content-addressed commits with
   branches, diffs, and merges. This unlocks review workflows, drift detection, and
   enterprise change management — competitors bolt this on; we make it native.
3. **AI as a multi-agent system over a knowledge graph, not a prompt wrapper.** Generation,
   review, validation, cost, and translation are specialized agents grounded in a curated
   cloud-services knowledge graph + RAG corpus, emitting CAML — never freeform text that
   we parse with hope.
