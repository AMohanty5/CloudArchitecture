# AWS Architecture Knowledge Engine

**Status:** spec / source-of-truth for the architecture-intelligence layer (Stage H
Phase 3B). **Scope:** catalog (`connectionRules` enrichment), `connections.ts`
(`evaluateConnection`), a new path-finder + advisor, the validation pack, and a recommended-
pattern UX. Extends [`aws-relationship-model.md`](./aws-relationship-model.md). Canonical
plan: `BUILD-PLAN.md`.

**Goal:** evolve from "can these two connect?" to an **assistant that understands AWS
service semantics** — *why* they connect, *how*, *what intermediary is required*, *whether
the pattern is recommended*, and *what the alternatives are* — and that **proposes and
inserts** the missing components.

**What already exists (don't rebuild):**
- The catalog `connectionRules` (inbound/outbound × kind) already form a **directed
  relationship graph** over abstract types.
- `classifyRelationship` already distinguishes **direct (data/traffic)**, **event (async)**,
  **identity (assumes)**, **monitoring (sidecar)**, **security**, **attachment**.
- `suggestFor` (Day 84) already computes **recommended targets** for a selected resource.
- The validation pack (SEC/OPS/NET rules) already emits advisory findings; the canvas
  already surfaces a reject reason (`showHint`).

The intelligence layer **enriches** these — it does not replace them.

---

## 1. Knowledge graph data model

Extend each catalog service's `connectionRules` with an optional **`knowledge`** block
(catalog-as-code, additive, no breaking change):

```yaml
connectionRules:
  outbound: [ ... ]          # existing — the "can connect" graph
  knowledge:                 # NEW (Phase 3B)
    recommendedTargets: [compute.serverless.function, integration.workflow]
    requiresIntermediary:    # target type → the intermediaries that bridge it
      storage.object: [compute.serverless.function, integration.etl]   # EventBridge → ? → S3
    antiPatterns:
      - { to: storage.object, reason: "Event routers don't write storage directly." }
      - { to: database.*,     reason: "Write through compute, not directly from the bus." }
    recommendedPatterns: [event-fanout, event-to-store]   # ids into the pattern library (§8)
```

The TypeScript view (`AwsServiceRelationship` from the brief) is derived from this + the
existing rules. Communication type = the existing connection `kind` (data/event/identity/
monitoring/network/control ≈ traffic/async/identity/observability/peering/dependency).

## 2. Relationship types (already classified)

| Brief term | Engine kind (`classifyRelationship`) | Render |
|---|---|---|
| Direct communication (EC2→S3, ALB→EC2) | `data` / `traffic` → `communicates_with` | connector |
| Event-based (S3→EventBridge→Lambda/SQS/SNS) | `async` → `communicates_with` | dotted connector |
| Monitoring (EC2→CloudWatch) | observability → `monitors` | 📊 sidecar (workloads publish; CW observes) |
| Identity (EC2→IAM Role) | `identity` → `assumes` | 🔐 badge (grants, not a path) |

These are done; Phase 3B adds the **verdict richness + intermediaries** on top.

## 3. Rich validation verdict

Upgrade `evaluateConnection` (or wrap it) to return a 4-state verdict instead of a boolean:

```ts
type Verdict =
  | { status: 'supported'; kind: string }                       // direct, recommended
  | { status: 'discouraged'; kind: string; reason: string }     // works but an anti-pattern
  | { status: 'needs-intermediary'; path: PathStep[]; reason: string; alternatives: PathStep[][] }
  | { status: 'unsupported'; reason: string; alternatives?: PathStep[][] };
```

- **supported** — a direct rule matches (today's `allowed`).
- **discouraged** — a direct rule matches *but* an `antiPatterns` entry flags it.
- **needs-intermediary** — no direct rule, but a valid path exists (§4) → return it.
- **unsupported** — no direct rule and no path within depth → plain rejection.

## 4. Intermediary path-finding (the headline)

The catalog rules are a graph: a directed edge `A → B` exists when some service permits an
outbound A→B (or inbound B←A). On a rejected `source → target`:

- **BFS** from `source`'s type to `target`'s type over the rules graph, depth ≤ 3, ranked by
  (curated `recommendedTargets` first, shortest path, then deterministic).
- Each intermediate **type** maps to a representative **service** (`compute.serverless.function`
  → Lambda) for display/insertion.
- `requiresIntermediary` metadata overrides/augments BFS with the canonical answer.

Worked examples (verified against the current catalog graph):
- **EventBridge → S3:** no direct rule. BFS finds `eventbridge → λ(lambda) → s3` (Lambda's
  outbound includes `storage.object`). Message: *"EventBridge doesn't write to S3 directly.
  Insert Lambda, Step Functions, or Firehose."* alternatives: `→ Step Functions → S3`.
- **CloudWatch → S3:** monitoring source. Canonical pattern from `requiresIntermediary`:
  *"CloudWatch can't write metrics to S3 directly. Use CloudWatch Logs → Firehose → S3 or a
  Logs → Lambda subscription."* (Firehose is a catalog-expansion item; until then suggest
  Lambda.)

## 5. Architecture recommendations (the message)

Replace the bare reject hint with a structured panel:

```
 ⚠ Invalid connection
 EventBridge is an event router; S3 is storage — no direct write.

 Suggested:
   ① EventBridge → Lambda → S3            [ Insert ]
   ② EventBridge → Step Functions → S3    [ Insert ]
   ③ EventBridge → Firehose → S3          [ Insert ]
```

Reason text comes from `antiPatterns`/category mismatch; options come from §4.

## 6. Architecture auto-correction

"Insert Recommended Pattern" materializes the path: for each missing intermediate type,
insert its representative service (reuse `addComponent` / the Day-54 attach path), then wire
`source → I₁ → … → target` with the right `kind`. One undoable command. Built on the
existing command bus — no new persistence.

## 7. Service knowledge base

Author the `knowledge` block across the catalog, by category (the brief's list): Networking,
Compute, Storage, Databases, Messaging, Security, Observability, AI, Contact Center. Most
`recommendedTargets` are derivable from `suggestFor`; `requiresIntermediary` + `antiPatterns`
are curated (the real authoring cost — a few dozen high-value entries first: event routers →
storage/db, monitoring → storage, identity → resources).

## 8. Architecture pattern library

Named, insertable patterns (extends `templates.ts` with smaller *fragments*, not full
architectures): Web App (Route53→CloudFront→ALB→EC2→RDS), Serverless API (APIGW→Lambda→
DynamoDB), Event-Driven (S3→EventBridge→Lambda→SNS), Contact Center AI (Connect→Lex→Bedrock→
KB, → Phase 3A). Patterns are referenced by `recommendedPatterns` ids and inserted via the
existing `paste`/`mergeTemplate` path. The auto-correction paths (§4) are dynamic mini-patterns.

## 9. Architecture Advisor panel

When a resource is selected, an **Advisor** section (in the inspector, beside ✦ Suggested):

```
 EventBridge — Advisor
 Valid targets:    Lambda · Step Functions · SNS · SQS
 Recommended:      Lambda · Step Functions
 Common patterns:  Event-Driven · Fan-out
 Anti-patterns:    ✗ direct storage writes  ✗ direct DB writes
```

Valid = from rules; Recommended = `recommendedTargets` (≈ `suggestFor`); Anti = `antiPatterns`.

## 10. UX / goal

The canvas teaches while you build: a rejected drag becomes a **lesson + a one-click fix**,
selecting a service shows its **recommended/anti-pattern playbook**, and patterns drop in as
scaffolds. Deterministic and explainable (graph + curated metadata) — never an opaque
"not allowed."

---

## 11. Roadmap (Stage H Phase 3B — Architecture Intelligence)

Directly addresses the reported "logical errors" (EventBridge→S3, CloudWatch→S3 rejected
with no guidance). Reuses the rules graph + `classifyRelationship` + `suggestFor`.

1. **Rules graph + path-finder** — build the type-graph from `connectionRules`; BFS
   intermediary search (depth ≤ 3); representative-service map. Pure + tested. *(Fixes the
   reported cases first.)*
2. **Rich verdict** — `evaluateConnection` → 4-state (`supported`/`discouraged`/
   `needs-intermediary`/`unsupported`); wire into the canvas reject flow.
3. **Recommendation panel** — replace the bare hint with the structured "Suggested
   architectures" panel (options from the path-finder).
4. **Auto-correction** — "Insert Recommended Pattern" materializes the path (insert
   intermediaries + wire) as one undoable command.
5. **Knowledge metadata** — add the `knowledge` block (recommendedTargets / requiresIntermediary
   / antiPatterns) to the catalog for the high-value services; lint it.
6. **Anti-pattern validation** — pack rules from `antiPatterns` (e.g. event-router→storage
   direct, monitoring→storage direct) as advisory findings.
7. **Architecture Advisor panel** — valid / recommended / common-patterns / anti-patterns
   in the inspector (reuses §5 metadata + `suggestFor`).
8. **Pattern library** — named insertable fragments + `recommendedPatterns` wiring.
9. **Golden + deploy** — path-finder goldens over the reported cases + the templates; deploy.

> **Cost note:** §5 (curated `requiresIntermediary`/`antiPatterns`) is the real authoring
> effort. Recommend shipping **1–4** first (the path-finder + verdict + recommend + auto-fix
> fixes the reported logical errors immediately, using BFS over the *existing* rules graph),
> then layering the curated metadata (5–8). The path-finder works on day one with no new
> catalog data — curation just sharpens the messages.
