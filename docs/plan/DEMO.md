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
