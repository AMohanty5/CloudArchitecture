# DEMO — the 5-minute flow

The proof the slice works end-to-end: **blank canvas → a typed, validated 3-tier
architecture → a real finding → a one-click fix → Terraform that validates.** No
slides. This is the doc-15 "never cut" demo.

Target: **≤ 5 minutes** once the stack is up.

---

## What it proves (the three claims, in order)

1. **Typed canvas** — you design against a real catalog; properties are schema-validated as you type, not free-text boxes.
2. **Deterministic validation** — the tool finds a genuine architecture risk (a database reachable from the internet) and a mechanically-fixable one (unencrypted storage) — and clears the fix in one click. This is *separate* from AI opinion.
3. **Instant IaC** — the same model exports to Terraform that `terraform validate` accepts.

---

## Prerequisites

- Node 22 + pnpm 10; Docker (Postgres + Redis); the `terraform` CLI (≥ 1.5) for the last beat.
- **Core must run as the built server** — `tsx` can't emit the decorator metadata Nest DI needs (see Day 11 notes), so `pnpm dev` won't boot the API.

## One-time setup

```bash
pnpm install
pnpm --filter @cac/core build           # tsc build → dist (DI-capable)
docker compose up -d                     # Postgres :5432 + Redis :6379
pnpm --filter @cac/core migrate          # apply migrations (idempotent)
```

## Start the stack (two terminals)

```bash
# 1) API on :3001 — run from apps/core so the catalog dir resolves, or set CATALOG_DIR
cd apps/core && node dist/main.js
#    boot publishes the 13 catalog services to Postgres + Redis

# 2) Web on :5173 (proxies /api → :3001)
pnpm --filter @cac/web dev
```

Open **http://localhost:5173**. (Optional: `pnpm --filter @cac/core seed` pre-loads
three demo architectures with history if you want a warm start.)

---

## The script (timed)

> Build a 3-tier app from scratch, ship a deliberate weakness, catch it, fix it, export it.

| # | Beat | Action | ~time |
|---|------|--------|------:|
| 1 | **Create** | List page → type a name → **New architecture** → lands in the editor | 0:15 |
| 2 | **Network** | From the palette drag **Amazon VPC** onto the canvas; drag **Subnet** *into* the VPC twice (a public + an app subnet). Set the public subnet's `public = true` in the inspector | 0:50 |
| 3 | **Tiers** | Drag **Application Load Balancer** into the public subnet, **EC2 Auto Scaling Group** into the app subnet, **Amazon RDS** into the app subnet | 0:45 |
| 4 | **Wire it** | Draw edges: ALB → ASG (traffic), ASG → RDS (data). Invalid edges (e.g. ALB → RDS) are refused with a catalog reason — show that once | 0:40 |
| 5 | **Type-safety** | Select the RDS node → in the schema-driven form set `engine = postgres`, `multiAz = true`, and **`storageEncrypted = false`** (the deliberate weakness). Try `instanceClass = huge` → rejected inline with the catalog message; set `db.t3.micro` | 0:50 |
| 6 | **Tidy + persist** | Click **✨ Tidy up** (ELK). Reload the page → the layout is preserved (Day 28) | 0:20 |
| 7 | **Validate** | Click **✓ Validate**. Two critical findings appear, and the flagged nodes get red dots on the canvas: <br>• **SEC-001** — *Orders DB stores data with encryption at rest disabled* (auto-fixable) <br>• **SEC-002** — *Orders DB is reachable from the internet-facing Web LB with no WAF in the path* | 0:35 |
| 8 | **One-click fix** | On SEC-001 click **⚡ Fix automatically** → `storageEncrypted` flips to true, the badge clears, and **History** shows the fix as a new commit | 0:20 |
| 9 | **Export** | **⬇ Export → Download all (.zip)** → one archive: `diagram.svg`, `hld.md`, `terraform/*.tf` | 0:15 |
| 10 | **Terraform** | In a terminal, unzip and validate (below) | 0:30 |

```bash
unzip ~/Downloads/*-bundle.zip -d demo-out && cd demo-out/terraform
terraform init -backend=false -input=false
terraform validate            # → "Success! The configuration is valid."
# `terraform plan` additionally needs AWS credentials; validate is the credential-free proof.
```

**Total: ~5:00.**

The honest punchline for SEC-002: it has *no* auto-fix — the remediation text offers
two real options (insert a WAF / privatise the subnet). That's the point: deterministic
findings with severity humility, not magic.

---

## Known rough edges (say these before someone finds them)

- **Catalog is 13 services**, not 60 — the palette is intentionally thin (Day 27).
- **No auth / single tenant** — every endpoint is open; multi-user is Stage F.
- **Connection validation is client-side** — an invalid edge is simply never drawn; there's no server-side connection pass yet.
- **Core runs as the built server**, not `pnpm dev` (decorator-metadata limitation).
- **`terraform plan`** needs AWS credentials; the demo stops at `validate`.

## Reset between runs

The seed is rerunnable (`pnpm --filter @cac/core seed` deletes its rows first). Demo
architectures you create by hand persist; delete them via the DB or just ignore them.

---

> Status: this script is the rehearsal artifact (re-sequence move C). Run it once on a
> live stack and record the real wall-clock + any blocker before showing it to anyone —
> the timing column is a budget, not a measurement.

---

# Demo v2 — generate with AI (Stage E)

The "show people" milestone: **a prompt becomes a validated architecture you can review and
merge.** Everything from Demo v1 still applies; this adds the generation pipeline on top.

## What it proves

1. **NL → architecture** — a sentence yields a typed, catalog-bound CAML model, streamed
   stage by stage (requirements → plan → compose → critic/repair).
2. **Deterministic validation is the spine** — the critic calls the *same* engine the canvas
   uses; a seeded weakness is caught and repaired before you ever see it.
3. **AI proposes, you merge** — the result lands as a reviewable diff with accept/reject; it
   never auto-merges to `main`.

## Extra prerequisite

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # the pipeline calls Claude (Sonnet for requirements,
                                      # Opus for plan/compose/critic/repair). Without it the
                                      # console streams a stubbed run (no model, no proposal).
```

Optional cost guard (per job): `AI_TOKEN_BUDGET` (default 250k tokens) and
`AI_JOB_TIMEOUT_MS` (default 180s) — the pipeline stops gracefully and returns a partial
result when either is exceeded.

## The script (timed)

| # | Beat | Action | ~time |
|---|------|--------|------:|
| 1 | **Prompt** | On the list page, in **✨ Generate with AI** type *"A highly available 3-tier e-commerce platform on AWS for ~30k RPS, PCI compliant"* → **Generate** | 0:10 |
| 2 | **Watch the pipeline stream** | The console streams stages live: `requirements` (extracted + inferred, incl. PCI), `planner` (patterns cited, every requirement mapped), `composer` (N components, pass-1+2 valid, repairs), `critic` (findings), `repair`, then a **Σ usage + ~$cost** line | 0:30 |
| 3 | **Review the proposal** | Click **→ review proposal** → the generated model renders as an all-**added** (green) diff with a summary + remaining-findings count | 0:25 |
| 4 | **Decide** | **Accept & merge** → it commits through the write path and opens in the editor (or **Reject** to discard) | 0:15 |
| 5 | **Validate** | In the editor, **✓ Validate** — confirm findings are clean (or use the **⚡ one-click fix** on any SEC-001) | 0:20 |
| 6 | **Export** | **⬇ Export → Download all (.zip)** → SVG + HLD + Terraform; `terraform validate` clean (as Demo v1) | 0:20 |

**Total: ~2:00** on top of a warm stack.

## Known rough edges (say them)

- **Generation is keyed** — no `ANTHROPIC_API_KEY` ⇒ a stubbed stream (fake stages), no proposal.
- **Single-shot composition** — not sectioned/parallel; **no progressive canvas draw** (the model
  appears once, at review).
- **`ai/gen-*` lineage is approximated** — accept commits a new architecture on `main`; a real
  AI branch + merge waits on branch endpoints.
- **Latency is real** — a full generation is several model calls (tens of seconds); the cost
  guard caps runaway jobs.

> Status: like Demo v1, this is the rehearsal artifact — run it once with a key on a live
> stack, record the wall-clock + the golden-suite pass rate (`ANTHROPIC_API_KEY=… pnpm
> --filter @cac/core test` runs the live evals), and fix the worst failure modes before showing it.

---

## Stage G — Architecture-diagram redesign (before / after)

Driven by the target-vs-current review (2026-06-21). The canvas was reshaped from a
sparse set of large service cards into an AWS-Architecture-Center-style diagram.

| Aspect | Before | After (Stage G) |
|---|---|---|
| Service nodes | 190×64 card, 26px icon, raw `aws.ec2` id badge | 172×54 compact block, 30px **glyph** icon, **role** subtitle ("Relational database") |
| Containers | faint tint, `label · kind` | category-coloured **header band** + tinted body; `tier` groups render as **section panels** (component rows inside) |
| Edges | thin bezier + kind text labels | orthogonal **arrowhead** edges, hover emphasis, **bidirectional** markers, opt-in protocol:port label chips |
| Icons | category-coloured abbreviation tile | per-category **vector glyphs** (chip / cylinder / shield / hub / …) + clean label |
| Layout | single left→right ELK | **preset picker** (Layered →/↓, Compact, Tiered) persisted per-architecture |
| Interaction | nudge + tidy only | **drag + snap-to-grid + alignment guides**; positions persist |
| Start | blank canvas | **one-click templates** (3-tier, Serverless API, EKS, Data lake, Multi-AZ, Layered platform) |
| Chrome | none | **title block** + collapsible **legend** (connectors + categories, model-aware) |

### Reproduce (warm stack)
1. **Architectures → Start from a template → "Layered platform"** — opens a populated, valid diagram.
2. **Tidy up** dropdown → switch presets (Layered → / Tiered ↓) to re-flow.
3. **🏷 Labels** → protocol/port chips on connections; hover an edge to emphasise.
4. Drag a node — it snaps to the grid and shows blue alignment guides; reload to confirm it persisted.
5. **⬇ Export → Download SVG** — the server SVG mirrors the canvas (compact nodes, category headers,
   glyph icons, arrowhead edges). PNG export rasterises the live canvas (exact).

### Parity + perf notes (say them)
- **PNG** export is the live canvas rasterised → exact match. **SVG** is a separate true-vector
  renderer brought to *close* parity (geometry, category colours, glyph icons, header bands,
  arrowheads); it does **not** reproduce section panels or ELK routing, and uses humanized type
  subtitles vs the canvas's curated role labels.
- **Icons** are per-*category* glyphs (distinct per service only via the label); fully per-service
  marks await the official AWS icon pack (licensing-gated backlog item).
- **Perf:** `project(500)` runs in ~1ms; the canvas uses viewport virtualization
  (`onlyRenderVisibleElements`) + zoom-LOD chips, so large models stay smooth.
