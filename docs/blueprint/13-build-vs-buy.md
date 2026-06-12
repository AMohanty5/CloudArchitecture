# 13 — Build vs Buy Decisions

Rule of thumb applied throughout: **build the core domain (CAML, catalog, validation,
agents-over-knowledge), buy generic capability, adopt OSS where the community already
solved a hard non-differentiating problem.**

| Capability | Decision | Choice | Rationale |
|---|---|---|---|
| Canvas engine | **Adopt OSS** | React Flow (MIT) | Pan/zoom/nodes is solved; our differentiation is the semantic layer above it. Building: 12+ eng-months for parity, zero moat. |
| Auto-layout | **Adopt OSS** | ELK.js | Only credible JS hierarchical+orthogonal layout. Writing a layout engine is a PhD, not a feature. |
| Real-time collab | **Adopt OSS + build thin** | Yjs + own websocket/persistence layer | CRDT correctness is brutal to hand-roll; Yjs is battle-tested (Figma-class apps). We own checkpoint-to-commit logic (differentiating). |
| SSO/SAML/SCIM | **Buy** | WorkOS | SAML edge cases are a tax; $125/connection beats one engineer-quarter + ongoing breakage. Revisit at 200+ enterprise connections. |
| Billing | **Buy** | Stripe (+ Billing for metering) | Obvious. |
| Notifications | **Buy** | Knock (or Novu OSS if cost-sensitive) | Preference management/digests are undifferentiated plumbing. |
| AuthZ engine | **Adopt OSS** | Cerbos | Policy-as-code, testable, embeds cleanly; building RBAC evaluators in-app calcifies. OpenFGA considered — ReBAC power unneeded for our scope model. |
| LLMs | **Buy (API)** | Anthropic Claude (primary), provider-abstracted | Frontier reasoning quality is the product experience; no version of self-hosting open-weights matches it for architecture reasoning in 2026. BYO-endpoint for enterprise. |
| Agent orchestration | **Build thin** | Own state machine on top of provider SDKs | LangGraph et al. evolve fast and leak abstractions; our flows are few and well-typed. The valuable part (prompts, schemas, eval) is ours regardless. |
| Embeddings/vector | **Buy API + pgvector** | Hosted embedding API; pgvector storage | No data-science team needed in P1–3; revisit dedicated vector DB at >50M vectors. |
| Graph DB | **Adopt OSS/managed** | Apache AGE (MVP) → Neo4j (scale) | Graph queries are core but the engine isn't. AGE-first defers ops cost. |
| Validation rules engine | **BUILD** ⭐ | CEL evaluator + graph rules + packs | This is product. Buying a CSPM engine (e.g. OPA-based cloud scanners) checks *deployed* clouds, not *designed* models — wrong abstraction level. We compile *to* CEL/Cypher (OSS evaluators) but rules, packs, and the model-IR are proprietary. |
| Cloud service catalog | **BUILD** ⭐ | Catalog-as-code + publishing pipeline | The moat. No vendor sells a typed, cross-cloud, equivalence-mapped service ontology. Hardest grind, highest defensibility. |
| CAML + versioning | **BUILD** ⭐ | Own DSL + commit DAG on Postgres | The product spine. Considered: backing onto real git (libgit2) — rejected: we need typed semantic diff/merge, per-element ACLs, and DB-side queryability; git's file model fights all three. |
| IaC generation | **BUILD templates, adopt parsers** | Own codegen; official HCL/CFN parsers for import | Generated-code quality is a headline feature; import parsing is solved OSS. |
| Cost data | **Build ingestion, public data** | Provider price APIs (free) + own normalizer | Vendors (Vantage, Infracost) price *deployed/planned* IaC; we price *models* — and Infracost's engine (OSS, Apache-2) is a reference, with possible partnership for Terraform-plan-level precision later. |
| Diagram import/export | **Build mappers** | Own Draw.io/VSDX mappers | Formats are documented; mapping fidelity to CAML is differentiating onboarding magic. |
| Cloud discovery | **BUILD on provider primitives** | Resource Graph / Cloud Asset Inventory / Config + own normalizer | Considered Steampipe/CloudQuery (OSS) as collectors — viable accelerant for long-tail coverage; decision point in Phase 4 planning. The normalize→CAML mapping layer is ours either way. |
| Observability | **Adopt OSS/managed** | OTel + Grafana stack (managed) | Undifferentiated. |
| Icons | **License** | Official AWS/Azure/GCP architecture icon sets (free with attribution terms) + our neutral set for abstract components | Familiarity matters to architects; terms permit this use. |

## The Three ⭐ Builds Are the Company

Everything in the "buy/adopt" column could be swapped without customers noticing.
The catalog, CAML+versioning, and the validation/knowledge layer could not — they are
where 60%+ of engineering investment should compound, and they are what an acquirer
or competitor cannot replicate quickly. Headcount allocation in every phase should be
audited against this table: if more engineers are working on bought-category glue than
on the three builds, the plan has drifted.
