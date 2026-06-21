# AWS Semantic Relationship Model

**Status:** spec / source-of-truth for the relationship-aware rendering overhaul.
**Scope:** `apps/web/src/canvas/` (projector, ServiceNode, GroupNode, connections),
catalog `connectionRules`, and the validation pack. Extends blueprint docs 05/06 and
[`visual-redesign.md`](./visual-redesign.md).

**Problem:** the canvas renders every relationship as a generic connector line, so a
*storage attachment*, a *security control*, an *IAM assumption*, and a *runtime API call*
all look identical. AWS resources have fundamentally different relationship types that
must render differently.

**Key fact:** the data model already distinguishes these — each connection has a `kind`,
and the catalog already assigns the right kind to each pair. This overhaul **derives a
relationship class from `(fromType, toType, kind)` and renders by class.** No breaking
schema change is required.

---

## 1. Relationship model

Five relationship classes, derived deterministically from endpoint abstract types + the
existing connection `kind`:

| Class | Meaning | CAML source | Renders as |
|---|---|---|---|
| **CONTAINS** | region▸vpc▸subnet▸resource | group membership (`component.group`, `group.parent`) | **nesting** (no line) |
| **ATTACHED_TO** | EBS/EFS/ENI/Layer attached to compute | `kind: dependency` + storage/attachable endpoint | **compartment inside owner** (or attach marker) |
| **SECURED_BY** | SG / NACL / KMS / Secrets protecting a resource | `kind: dependency` + firewall/keys/secrets endpoint | **badge/chip on the resource** (no line) |
| **ASSUMES** | EC2/Lambda/ECS assumes an IAM role | `kind: identity` + `security.identity.*` endpoint | **identity badge / metadata** (no line) |
| **COMMUNICATES_WITH** | runtime API/data/event flow | `kind: traffic\|data\|async\|replication` (+ peering) | **connector** (the only lines) |

### Derivation (pure function — `classifyRelationship`)

```ts
type RelationshipClass = 'attached_to' | 'secured_by' | 'assumes' | 'communicates_with';
// CONTAINS is group membership, handled separately (it is not an edge).

const isPrincipal   = (t) => t.startsWith('security.identity');       // IAM role/principal
const isSecurityCtl = (t) => t.startsWith('network.firewall')        // SG / NACL
                          || t.startsWith('security.keys')           // KMS
                          || t.startsWith('security.secrets');       // Secrets Manager
const isAttachable  = (t) => t.startsWith('storage.block')           // EBS
                          || t.startsWith('storage.file')            // EFS
                          || t.startsWith('network.interface');      // ENI (future)

function classifyRelationship(fromType, toType, kind): RelationshipClass {
  if (['traffic', 'data', 'async', 'replication', 'observability'].includes(kind)) return 'communicates_with';
  if (kind === 'identity') {
    if (isPrincipal(fromType) || isPrincipal(toType)) return 'assumes';
    return 'communicates_with';                 // e.g. Cognito auth flow
  }
  if (kind === 'dependency') {
    if (isSecurityCtl(fromType) || isSecurityCtl(toType)) return 'secured_by';
    if (isAttachable(fromType)  || isAttachable(toType))  return 'attached_to';
    return 'attached_to';                        // default structural dependency = attach
  }
  if (kind === 'peering') return 'communicates_with';
  return 'communicates_with';
}
```

The **owner** (the node a folded relationship renders *onto*) is the primary resource —
`compute.*` or `database.*`; the storage/firewall/principal is the secondary that folds
in. For `secured_by`/`assumes` where both could be primary (e.g. NACL→subnet), the
*group* or the non-control resource is the owner.

---

## 2. Rendering rules

| Class | Rule |
|---|---|
| CONTAINS | Nest child inside parent container. No connector. Region/VPC = washes, subnet = lane (see visual-redesign §3). |
| ATTACHED_TO | **Option A (default):** fold the attached resource into a **compartment row** inside the owner node (suppress its standalone node + the edge). **Option B:** short stub with a filled-dot terminator `EC2 ──◉ EBS`, no arrowhead — used when an attachment is shared by many owners. |
| SECURED_BY | Render as a **chip** on the owner (`🛡 sg-web`); details in the inspector's Security panel. No line. NACL→subnet renders as a chip on the subnet lane label. |
| ASSUMES | Render as an **identity badge** on the owner (`🔐 AppRole`); details in the inspector's Identity panel. No line. |
| COMMUNICATES_WITH | The only connectors. Solid = traffic/request, dashed = data, dotted = async/monitoring, double-headed = bidirectional. Desaturated, thin (see visual-redesign §5). |

**Layout impact:** only COMMUNICATES_WITH edges are fed to ELK. ATTACHED_TO / SECURED_BY /
ASSUMES are folded into nodes *before* layout, so they add zero edge clutter and never
distort routing. This alone removes the bulk of the lines in the current render.

---

## 3. UI mockups

**Composite EC2 node (attachments folded in):**

```
   ┌─────────────────────────────┐
   │ ▟▙  Amazon EC2               │   ← header: icon + name (dominant)
   │     App tier                 │
   │  ┌───────────────────────┐   │
   │  │ ▣ EBS · gp3 · 100 GB   │   │   ← ATTACHED_TO compartment
   │  └───────────────────────┘   │
   │  🛡 sg-web   🔐 AppRole       │   ← SECURED_BY + ASSUMES badges
   └─────────────────────────────┘
            │  data
            ▼
        ┌──────┐
        │ ▟▙ S3│   COMMUNICATES_WITH (the only line)
        └──────┘
```

**Your `test2`, redesigned (before → after):**

```
BEFORE (today)                          AFTER (semantic)
subnet                                  us-east-1 ▸ Production VPC
 ├ EC2                                   subnet-a   ┌ EC2 ─ EBS ─ 🛡sg ─ 🔐role ┐──┐
 ├ EBS        (4 peer nodes,             subnet-b   └ EC2 ─ EBS ─ 🛡sg ─ 🔐role ┘  │ data
 ├ SecurityGroup   IAM→S3 lines)         subnet-c     EC2 ─ EBS ─ 🛡sg              ▼
 └ IAM Role  ───────► S3                  NACL 🛡(on subnets)                    [ S3 ]
                                          one line total:  EC2 ─data─► S3
```

**Inspector panels (manage without drawing lines):**

```
 ┌ EC2 · App tier ───────────────┐
 │ Attachments                    │
 │   ▣ EBS gp3 100GB        [×]    │
 │   + Attach storage…            │
 │ Security                       │
 │   🛡 sg-web              [×]    │
 │   + Add security group…        │
 │ Identity                       │
 │   🔐 AppRole             [×]    │
 │   + Assume role…               │
 │ Communicates with              │
 │   → S3 (data)            [×]    │
 └────────────────────────────────┘
```

---

## 4. Data model changes

Goal: **zero breaking change**; existing diagrams light up via derivation.

- **No new required fields.** `classifyRelationship()` derives the class at projection
  time from existing `(type, type, kind)`.
- **Optional persisted override** (power users / ambiguous cases):
  - `connection.relationship?: 'attached_to'|'secured_by'|'assumes'|'communicates_with'`
    — explicit class, overrides derivation.
  - `connection.render?: 'fold'|'marker'|'line'` — Option A vs B vs force-a-line.
- **Component render hint (derived, not stored):** the projector computes
  `foldedInto: ownerId` for attachment/security/identity secondaries; their standalone
  node is suppressed.
- Catalog `connectionRules` are unchanged — they already emit the right `kind`. (Optional
  future: add a `relationship` hint per rule for cases the type-derivation can't resolve.)

This keeps CAML valid, diffable, and IaC-exportable exactly as today.

---

## 5. Auto-layout recommendations

- **Feed ELK only COMMUNICATES_WITH edges.** Folded relationships are resolved first, so
  the graph ELK sees is just resources + communication — clean LR flow.
- **CONTAINS** stays hierarchical nesting (region/vpc/subnet), but rendered as
  washes/lanes (visual-redesign §3) so it's context, not cages.
- Add the virtual **entry node** + **tier ranks** (visual-redesign §8) so flow reads
  Internet → edge → app → data.
- Composite nodes are taller (compartments/badges) — feed ELK their *measured* height so
  spacing stays correct.

---

## 6. Component hierarchy changes

`ServiceNode` becomes a **composite**:

```
ServiceNode
 ├─ Header        (category icon tile + name)              ← always
 ├─ Compartments  (0..n ATTACHED_TO rows: EBS/EFS/ENI)     ← when attached
 └─ BadgeRow      (SECURED_BY chips + ASSUMES identity)    ← when secured / assumes
```

Projector emits, per primary resource, a node whose `data` carries
`{ attachments[], security[], identity[] }`, derived by folding its non-communication
edges. Secondary resources that are fully folded emit **no** node. A secondary that is
*also* a communication endpoint (rare) still renders as its own node.

---

## 7. Per-service relationship matrix

| Service (type) | Participates as | Class → render |
|---|---|---|
| **EC2** `compute.vm` | owner of EBS/ENI; secured by SG; assumes role; talks to S3/RDS | host node with compartments+badges; lines only to S3/RDS |
| **EBS** `storage.block` | attached to EC2 | ATTACHED_TO → compartment in EC2 (no node, no line) |
| **EFS** `storage.file` | mounted by EC2/ECS/Lambda | ATTACHED_TO → compartment; *or* a node with `mount` markers when shared by many |
| **Security Group** `network.firewall.network` | secures EC2/ALB/RDS/Lambda | SECURED_BY → 🛡 chip on each protected resource |
| **NACL** `network.firewall.network` | secures subnet | SECURED_BY → 🛡 chip on the subnet lane |
| **IAM Role** `security.identity.principal` | assumed by EC2/Lambda/ECS; grants S3/DDB | ASSUMES → 🔐 badge on compute; grant-to-resource → 🔐 badge on the resource (see §8), never a line |
| **KMS / Secrets** `security.keys`/`secrets` | encrypts/holds secrets for a resource | SECURED_BY → 🔑 chip |
| **S3** `storage.object` | talked to by compute | COMMUNICATES_WITH target (data) → node + line in |
| **Lambda** `compute.serverless.function` | assumes role; talks to DDB/S3; attaches layer/EFS | host node + badges; lines to DDB/S3 |
| **RDS** `database.relational` | secured by SG; talked to by app; replicates | host node + 🛡 chip; data lines in; replication line to replica |
| **ECS service** `compute.container.orchestrator.service` | assumes task role; pulls ECR (dependency); talks to RDS | host node + 🔐; ECR=ATTACHED_TO compartment; data line to RDS |
| **EKS** `compute.container.orchestrator` | assumes role; pulls ECR | host node + 🔐; ECR compartment |
| **VPC / Subnet** group | CONTAINS resources; secured by NACL | nesting wash/lane + 🛡 NACL chip |

---

## 8. The IAM → S3 question (explicit guidance)

"EC2 uses an IAM role to access S3" is **three facts**, modeled distinctly:

1. **EC2 ASSUMES AppRole** → 🔐 badge on EC2 (no line).
2. **AppRole grants S3** → 🔐 *grant* badge on S3 (no line) — *the permission*, not a path.
3. **EC2 COMMUNICATES_WITH S3 (data)** → the single connector — *the access path*.

Rule: **a `security.identity.*` → non-compute resource edge is a GRANT**, rendered as a
badge on the resource, **never a connector.** When a user draws `IAM → S3`, the canvas
classifies it as a grant badge and a validation hint suggests adding `EC2 → S3 (data)` for
the access path. This is exactly the "Do NOT draw IAM Role ──► S3" requirement.

---

## 9. Creating & editing relationships in the canvas

| Gesture | Result |
|---|---|
| **Drop service onto a node** (EBS/SG/IAM onto EC2) | auto-classified attach/secure/assume → folds in as compartment/badge (no line drawn). *Resolves the "can't draw EBS→EC2" friction entirely.* |
| **Drag handle → handle** between two communicating resources | COMMUNICATES_WITH connector; kind picked from catalog (traffic/data/async). |
| **Inspector "Attach… / Add SG… / Assume role…"** buttons | create the relationship from a picker of valid targets (no canvas drawing needed). |
| **Click a compartment/badge** | selects the underlying resource/edge for editing or detach. |
| **Drag an attached resource out of its owner** | converts ATTACHED_TO back to a standalone node (un-fold). |

Validation additions (Phase 3): warn on a free-floating EBS/SG/IAM (unattached), and on a
direct `IAM → resource` data line (suggest the assume + communicate pattern).

---

## 10. Roadmap impact

> **Canonical day numbering + status lives in `docs/plan/BUILD-PLAN.md` → Stage H.** This
> section is the *relationship-model detail*; if the two disagree, Stage H wins.

This reframes Phase-1/2 around relationship semantics (supersedes the line-drawing-only
view of Days 52–53):

- **52** Relationship-aware **input**: drop-onto-node creates the *classified* relationship
  (attach/secure/assume) instead of a line; handle-drag stays COMMUNICATES_WITH. Add
  `classifyRelationship()` + 4-side handles. *(Also fixes the EBS/SG/IAM connect bug.)*
- **53** Composite `ServiceNode` — attachment compartments + security/identity badges;
  projector folds non-communication edges into owners.
- **54** Inspector panels: Attachments / Security / Identity / Communicates-with (create,
  detach, un-fold). VPC endpoints work folds in here.
- **55** Multi-subnet authoring + NACL→subnet chip.
- **56–66** Visual system (visual-redesign.md), now layered on the de-cluttered semantic graph.
- **67** Validation: grant-not-path hint, orphan-attachment, IAM→resource line warning.
- **68** Golden re-render of `test2` + templates; before/after; export parity.
