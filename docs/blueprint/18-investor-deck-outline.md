# 18 — Series A Deck Outline (condensed from the blueprint)

Fifteen slides + appendix. Each slide lists its single message, content, and source doc.

| # | Slide | The one message | Content | Source |
|---|---|---|---|---|
| 1 | Title | "Cloud Architect Copilot — the system of record for cloud architecture" | Logo, one-liner, raise amount | — |
| 2 | Problem | Architecture lives in 4 places that drift apart the day they're made | The diagram/IaC/docs/reality split; cost of drift (failed audits, prod incidents, consultant rework) — anchor with 2 design-partner anecdotes | 00 |
| 3 | Insight | All four artifacts are projections of one model | The CAML hub diagram (diagram/IaC/docs/cost/validation radiating from one versioned model; cloud syncing back into it) | 00, 05 |
| 4 | Product | Prompt → validated architecture → Terraform → kept in sync | 90-second demo storyboard: NL prompt streams a diagram; validation badges appear; one click to Terraform; drift alert closes the loop | 01, 07 |
| 5 | Why now | LLMs finally emit *valid structured models*; cloud complexity passed human limits; compliance became procurement | Three trend lines, one sentence each | 00 |
| 6 | Market | Bottom-up: 4M+ cloud-responsible engineers; diagramming + FinOps + CSPM budgets all touch us | TAM/SAM/SOM build from seats × $49–99; expansion into enterprise governance | 00 |
| 7 | Competition | Everyone has one corner; nobody has the model | 2×2: semantic depth vs cloud connectivity. Lucid/Draw.io bottom-left, Hava right-bottom, Brainboard mid, us top-right | 00 |
| 8 | Moat | The catalog + knowledge graph + validated-pattern corpus compound with usage | Three ⭐ builds (catalog, CAML+versioning, validation/knowledge); data flywheel: accepted designs → patterns → better generation | 13, 07 |
| 9 | Business model | Free → Pro $49 → Team $99 → Enterprise custom | Pricing ladder, expansion motion (designer lands, team collaborates, org governs), 75% gross margin incl. LLM COGS | 00, 11 |
| 10 | Go-to-market | PLG bottom-up + "import your account in 15 minutes" as the enterprise wedge | Phase 1–2 PLG metrics plan; Phase 4 discovery demo as sales motion; consultant/MSP channel | 12, 09 |
| 11 | Traction / validation | (fill at raise time) | Design partners, WAU, MRR, generation-acceptance rate — the metrics the roadmap exit criteria already define | 12 |
| 12 | Technology | Five-plane architecture, git-semantics versioning, agents over a knowledge graph — built by people who've run platforms | One-slide system diagram; emphasize eval-gated AI and read-only cloud trust model (pre-empts the two diligence questions) | 01, 07, 09 |
| 13 | Roadmap | 5 phases, 29 months, each phase sellable | Gantt strip + phase exit criteria (500 WAU → $25k → $100k → $300k → $1M MRR) | 12 |
| 14 | Team & ask | Raising $X for 30 months to $1M+ MRR | Team grid (8→32 plan), use of funds split (~70% eng per build-vs-buy discipline), milestones the money buys | 12, 13 |
| 15 | Vision | Every architecture decision on Earth, modeled, validated, and true | The "system of record" endgame: standards engine, marketplace, the architecture graph of the industry | 12 P5 |

## Appendix slides (diligence pre-empts)

- **A1 Security & trust**: read-only connectors (ExternalId/WIF, no stored secrets),
  tenant isolation layers, SOC 2 timeline → doc 09, 10
- **A2 AI quality**: eval harness, golden-suite pass rates, deterministic-engine
  separation ("AI proposes, engines decide") → doc 07, 17
- **A3 Unit economics**: per-job token costs vs plan pricing, caching strategy, COGS
  model → doc 07, 11
- **A4 Catalog economics**: 1.5 services/day, definition of done, why this grind is the
  moat not a liability → doc 14
- **A5 Competitive teardown**: feature matrix vs Lucid/Cloudcraft/Hava/Brainboard,
  quarterly competitor-demo-day discipline → doc 00, 12

## Narrative thread (the 3-minute verbal version)

Problem (drift tax) → Insight (one model, many projections) → Demo (prompt → validated
→ Terraform → drift alert) → Moat (the model + catalog compound; canvas is commodity)
→ Motion (PLG seat → team → governed enterprise) → Ask (29 months, five sellable
phases, $1M+ MRR exit velocity).
