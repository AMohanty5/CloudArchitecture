# Sidebar / Palette Redesign — Architecture-First Toolbox

**Status:** spec / source-of-truth for the palette overhaul. **Scope:**
`apps/web/src/canvas/Palette.tsx` (+ new palette components), `apps/web/src/lib/queries.ts`
(search), `apps/core/.../catalog/ranking.ts` (search ranking), and a **catalog-domain
expansion** (Contact Center + GenAI). Companion to `visual-redesign.md` /
`aws-relationship-model.md`. Canonical day plan: `BUILD-PLAN.md → Stage H`.

**Problem:** the current palette (`Palette.tsx`) is a *flat, service-first catalog* —
every one of 61 services as an equal-weight card showing its `aws.x` key, grouped only by
abstract-type prefix. It reads as "a database of AWS services," not "a cloud architect's
toolbox": endless scroll, no hierarchy, containers mixed with workloads.

**Goal:** find any service in < 2s; build common architectures with minimal scrolling;
discover related services naturally; templates over dragging; feels purpose-built.

> **Hard dependency, flagged up front:** the **Contact Center** and **AI & GenAI**
> sections are *empty today*. The catalog has 61 AWS infra services and **none** of
> Connect / Contact Flow / Queue / Lex / Voice ID / Bedrock / SageMaker / Knowledge Base.
> Those sections need a **catalog expansion** (new CAML abstract types + service YAMLs +
> icons + connection rules) — a multi-day workstream tracked separately from the sidebar UI.

---

## 1. Information architecture (architecture-first)

Replace abstract-type grouping with a 9-domain taxonomy, derived by a frontend
`domainOf(service)` (no catalog change for the existing 61). `(new)` = needs catalog work.

| Domain | Source (catalog) |
|---|---|
| 🏗 **Architecture Containers** | `groupKind` services (aws.vpc, aws.subnet) + synthetic **Region/AZ** (create region/zone groups, no binding) + aws.transit_gateway, aws.vpc_peering |
| 🌐 **Edge & Networking** | `network.*` minus containers: route53, cloudfront, waf, api_gateway, alb, nlb, internet_gateway, nat_gateway, direct_connect, vpn_gateway, global_accelerator, privatelink, vpc_gateway_endpoint |
| 💻 **Compute** | `compute.*`: ec2, ec2_asg, ecs, eks, fargate, lambda, app_runner, batch, ecr |
| 🗄 **Data & Storage** | `storage.*` + `database.*`: s3, ebs, efs, s3_glacier, backup, rds, aurora_*, dynamodb, documentdb, elasticache, opensearch, redshift, timestream |
| 📨 **Integration & Messaging** | `messaging.*` + `integration.*`: eventbridge, sns, sqs, kinesis, msk, step_functions, glue, scheduler |
| 🔐 **Security & Identity** | `security.*` + `network.firewall.network`: iam, iam_role, security_group, nacl, cognito, secrets_manager, kms, acm, cloudtrail |
| 📈 **Observability** | `observability.*`: cloudwatch (+ X-Ray `(new)`) |
| 🎧 **Contact Center** `(new)` | aws.connect, contact_flow, queue, routing_profile, agent, contact_lens, lex, voice_id, knowledge_base |
| 🤖 **AI & GenAI** `(new)` | aws.bedrock, knowledge_base, vector_store, guardrails, sagemaker (+ opensearch as vector store) |

Region/AZ are **synthetic palette items** (no catalog service) that call
`editor.addGroup` with `groupKind: region|zone`.

The `domainOf` map keys off abstract-type prefix, with explicit overrides for the
container-vs-networking split (transit/peering → Containers though they're `network.*`).
Optional future: persist an explicit `domain` field per catalog service.

---

## 2. Sidebar wireframe

```
 ┌─ 260px ───────────────────────────┐
 │ ⌕ Search services…       ⌘K       │  ← search = primary; ⌘K opens command palette
 │ [Compact ▾]                        │  ← density toggle (segmented)
 ├────────────────────────────────────┤
 │ ★ FAVORITES                        │  ← pinned + auto-recents
 │  ▟ EC2   ▟ S3   ▟ Lambda  ▟ VPC    │
 ├────────────────────────────────────┤
 │ ◳ TEMPLATES                    ▸   │  ← collapsible; drag = scaffold
 │  3-Tier · Serverless · Data Lake…  │
 ├────────────────────────────────────┤
 │ ✦ SUGGESTED  (EC2 selected)        │  ← context-aware, only when a node is selected
 │  ▟ Security Group  ▟ IAM Role       │
 │  ▟ EBS             ▟ ALB             │
 ├────────────────────────────────────┤
 │ 🏗 Architecture Containers     ▾   │  ← collapsible domain sections, compact tiles
 │  ▟ Region  ▟ VPC  ▟ Subnet  ▟ AZ    │
 │ 🌐 Edge & Networking           ▸   │
 │ 💻 Compute                     ▸   │
 │ 🗄 Data & Storage              ▸   │
 │ 📨 Integration & Messaging     ▸   │
 │ 🔐 Security & Identity         ▸   │
 │ 📈 Observability               ▸   │
 │ 🎧 Contact Center              ▸   │  ← (new) catalog domain
 │ 🤖 AI & GenAI                  ▸   │  ← (new) catalog domain
 └────────────────────────────────────┘
```

Sections are **collapsed by default** except Favorites + the section matching the user's
last drop. Domain headers carry the emoji + count; chevron toggles; state persisted.

---

## 3. UX flow

- **Open editor** → focus search; Favorites + Templates visible; domains collapsed.
- **Type** → flat ranked results across domains (debounced), match-highlighted; Enter
  inserts the top hit at viewport center.
- **⌘K / `/`** → command palette overlay: "Create EC2", "Insert 3-Tier template",
  "Create Connect Queue" → inserts without dragging (faster than the sidebar).
- **Select a node** → SUGGESTED strip appears with related services.
- **Drag a tile** (or click its `+`) → insert; the service auto-joins Recents.
- **Hover a tile** → reveal the `aws.x` id + a one-line description tooltip.

---

## 4. Compact card / density modes

Three densities (persisted `cac:palette-density`, default **Compact**):

```
 Compact (28px)      Comfortable (44px)        Detailed (60px)
 ▟ EC2               ▟ EC2                      ▟ EC2
                       Elastic Compute Cloud      Elastic Compute Cloud
                                                  aws.ec2
```

- Tile = icon (18–20px) + short name; no border; **soft hover** (bg tint + subtle
  shadow). `aws.x` id and description **on hover only** (never inline in Compact).
- Short name = the AWS short form (EC2, S3, ALB) — a `shortName(service)` derived from key/name.
- Consistent tile height per density; 8px grid; grid-of-2 for Favorites/Suggested.

---

## 5. Search redesign

- **Backend (`ranking.ts`)**: add a `keywords`/`aliases` haystack so domain terms resolve.
  Source from a synonym map + optional per-service `keywords` (catalog-as-code):
  - "database" → database.* (works today via types); "nosql" → dynamodb; "object storage"
    → s3; "load balancer" → alb/nlb (works via name); "cache" → elasticache; "queue" →
    sqs; "contact center" → Contact Center domain `(new)`; "genai"/"llm" → Bedrock `(new)`.
  - Add `keywords` to the scored haystacks (weight ~5, between name and types).
- **Frontend**: debounced; results as a flat compact list with the matched substring
  bolded; show the domain as a faint right-aligned tag; Enter = insert top hit.

---

## 6. Favorites + recents

- **Pinned favorites**: a ★ on each tile toggles membership; stored in `cac:favorites`
  (service keys). Seeded with EC2/S3/Lambda/RDS/VPC on first run.
- **Recents**: every insert (drag or command) pushes the key to `cac:recents` (LRU, cap 8).
- Favorites section = pinned first, then recents (deduped), 2-col grid of Compact tiles.

---

## 7. Template system in the sidebar

- A collapsible **Templates** section listing `templates.ts` entries (3-Tier, Serverless,
  Data Lake, Event-Driven, Microservices, EKS, Multi-Region DR) + the `(new)` Connect/RAG
  ones once the catalog supports them.
- **Two insert modes**: (a) *new architecture* (today's `createArchitectureFromTemplate`,
  from the list page) and (b) **insert into current canvas** — a new `mergeTemplate(body)`
  that remaps ids (reuse `remapFragment` from `clipboard.ts`) and applies AddGroup/
  AddComponent/Connect commands at an offset. Dragging a template = mode (b).
- Connect/RAG templates depend on the catalog expansion (§9).

---

## 8. Context-aware recommendations

When a component is selected, show a **SUGGESTED** strip. Derive deterministically:

- **From connection rules** (already in the catalog): services whose rules can connect to
  the selected type — e.g. selecting EC2 surfaces SG, IAM role, EBS, ALB (all have rules
  touching `compute.vm`). Reuse the Day-52 `/catalog/connection-rules`.
- **Plus a curated boost map** per type for ordering/common pairings:
  - `compute.vm` → [security_group, iam_role, ebs, alb]
  - `database.relational` → [security_group, secrets_manager, kms]
  - `contactcenter.instance` `(new)` → [queue, routing_profile, contact_flow, bedrock, lex]
- Cap at ~4; exclude already-connected; one-click insert + auto-attach (Day-54 path).

---

## 9. Contact Center + GenAI catalog domains `(new)` — the prerequisite

Net-new catalog content (this is the big hidden cost):

- **CAML taxonomy**: add abstract types — e.g. `contactcenter.instance`,
  `contactcenter.flow`, `contactcenter.queue`, `contactcenter.routing_profile`,
  `contactcenter.agent`, `ai.model.foundation` (Bedrock), `ai.knowledge_base`,
  `ai.guardrail`, `ai.ml_platform` (SageMaker), `ai.voice_id`, `nlp.bot` (Lex). Each must
  be added to `schemas/caml-1.0.schema.json` + regenerated types.
- **Service YAMLs**: aws.connect, aws.connect_flow, aws.connect_queue,
  aws.connect_routing_profile, aws.contact_lens, aws.lex, aws.voice_id, aws.bedrock,
  aws.bedrock_knowledge_base, aws.bedrock_guardrails, aws.sagemaker — with icons,
  properties, and **connection rules** (e.g. Connect → Lex/Bedrock/Queue; Bedrock →
  Knowledge Base → OpenSearch vector store).
- **Templates**: Amazon Connect, Connect + Bedrock, Connect + LiveKit/Pipecat (external —
  generic components), RAG architecture.
- Sequenced as its own catalog-expansion block; the sidebar renders the domains empty
  until then (with a subtle "coming soon" affordance, or hidden when empty).

---

## 10. Visual specification (Figma-level)

| Token | Value |
|---|---|
| Sidebar width | 264px (search) · resizable later |
| Tile height | Compact 28 · Comfortable 44 · Detailed 60 |
| Tile icon | 18 (compact) / 20 (comfortable+) |
| Tile name | `TYPE_SCALE.name` (13) / 600; short form |
| Section header | `TYPE_SCALE.label` (11) / 600 / `NEUTRAL.muted`, uppercase, emoji + count + chevron |
| Hover | bg `rgba(slate,0.05)` + `SHADOW.node`; 120ms ease |
| Borders | none on tiles; 1px hairline between sections only |
| Density toggle | segmented control, top-right of search |
| Star (favorite) | ghost until hover/active; filled when pinned |
| Spacing | 8px grid; section gap `SPACE.md`; tile gap `SPACE.xs` |
| Empty `(new)` domain | hidden, or a single muted "Coming soon" row |

Visual language: minimal borders, whitespace, soft hovers, subtle elevation — Linear /
Vercel / Figma layers panel. Consumes the Day-56 design tokens.

---

## 11. Roadmap (Phase 2B — folded into Stage H)

Two interleaved tracks; the catalog expansion gates the Contact Center / GenAI UI.

**Sidebar UI (frontend):**
1. Domain IA + collapsible sections + compact tiles + density modes (replaces `Palette.tsx`).
2. Favorites + recents (localStorage) + hover metadata.
3. Search upgrade (keywords/aliases in `ranking.ts` + flat highlighted results).
4. Templates-in-sidebar + `mergeTemplate` (insert into current canvas).
5. ⌘K command palette (insert-by-name; faster than drag).
6. Context-aware SUGGESTED strip (from connection rules + curated boosts).

**Catalog expansion (prerequisite for 🎧 / 🤖):**
7. CAML taxonomy additions (contactcenter.* / ai.* types) + schema regen.
8. Contact Center service YAMLs + icons + rules + templates.
9. GenAI (Bedrock/KB/Guardrails/SageMaker/vector store) YAMLs + rules + RAG/Connect+Bedrock templates.

Recommended order: ship the **sidebar UI on the existing 61 services first** (items 1–6 —
immediate, high impact), then the **catalog expansion** (7–9) which lights up the two new
domains and the Connect/RAG templates.
