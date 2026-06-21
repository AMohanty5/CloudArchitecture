# Canvas Composition & Architecture Storytelling

**Status:** spec / source-of-truth for the architecture-composition overhaul (Stage H
Phase 2C). **Scope:** `apps/web/src/canvas/` — `projector.ts`, `layout.ts`, `GroupNode`,
`ServiceNode`, `relationships.ts`, plus a new backdrop layer + view system. Builds on
[`visual-redesign.md`](./visual-redesign.md), [`aws-relationship-model.md`](./aws-relationship-model.md).
Canonical day plan: `BUILD-PLAN.md → Stage H, Phase 2C`.

**Where we are (Phase 2 done):** semantics are correct (folding, attach/secure/assume,
endpoints, peering) and the diagram is *styled* like a reference architecture (demoted
containers + washes, icon-forward nodes, public/private lanes, light/dark theme,
desaturated connectors, Internet entry node, opt-in Flow layout).

**What still feels wrong:** the diagram is still **laid out as nested containers**, not
**composed as an architecture**. Containers are hard ELK parents, so flow can't run
straight across them → excess empty space, long connectors, weak storytelling. This phase
moves from *resource modeling* to *architecture composition*: the eye should follow
**ALB → EC2 → S3**, not VPC borders.

The diagram must answer in 5 seconds: what is it · where does traffic enter · where does
compute run · where is data · how do things talk · what networking · what security.

---

## 1. Updated rendering architecture — backdrops, not cages

**The core change.** Today region/VPC/subnet are ELK *parent containers* (`INCLUDE_CHILDREN`),
which forces nested layout and long routing. Replace that with a **backdrop layer**:
containers are rendered as **background regions computed from the bounding box of their
members**, *after* the flow is laid out — they no longer constrain the layout.

New render pipeline (z-order, back → front):
```
1. Region backdrop wash        (computed bbox of all members, big quiet title)
2. VPC backdrop wash           (bbox, hairline, corner label)
3. AZ band                     (bbox, lighter than VPC)
4. Subnet lane                 (bbox, public/private tint)
5. Edges                       (communication + folded link connectors)
6. Resource nodes              (compute primary, with folded attachments/badges)
7. Overlays / sidecars / chips (networking overlays, observability sidecars)
```
Implementation: the projector emits **leaf nodes + flow edges only** to ELK (no group
nesting); a new `backdrops` pass computes each container's rectangle from its members'
laid-out positions and emits non-interactive backdrop rectangles behind the nodes
(React Flow custom nodes with `zIndex` < 0, or a dedicated SVG layer). `GroupNode` becomes
a backdrop renderer (it already paints washes + corner labels from Day 58).

This is what unlocks every "minimize connector length / horizontal flow" requirement.

## 2. Layout engine recommendations

- **Lay out the flow graph, not the container tree.** Feed ELK only resource nodes +
  `communicates_with` edges (folded relationships already excluded). Containers are
  derived afterward as backdrops → ELK is free to place `ALB | EC2 | RDS` in adjacent
  layers regardless of which subnet each sits in.
- **Tier ranks** (`tierRank`, Day 64) drive `elk.partitioning` so flow reads entry → edge
  → compute → data left-to-right by default (promote "Flow" from opt-in to the archetype
  default once backdrops land).
- **Membership cohesion:** add an ELK constraint/weight so same-subnet / same-AZ members
  cluster (so a backdrop stays a tidy rectangle, not scattered). Use
  `elk.layered.considerModelOrder` + group seeds, or a light post-pass that nudges members
  together.
- **Archetype presets** (extend `LAYOUT_PRESETS`): 3-Tier, Serverless, Event-Driven, Data
  Platform, Hub-and-Spoke, Multi-AZ, Multi-Region, VPC-Connectivity, Contact Center — each
  = tier-rank rules + lane seeds + entry placement. Auto-detect from topology; user-override.
- **Success metric:** no connector spans the canvas unless architecturally required
  (cross-region/peering). Add a dev assertion on max edge length in the golden tests.

## 3. Region & AZ modeling

- **Region** — already a `groupKind`; render as the outermost **backdrop** (2–3% wash, big
  light title, near-invisible border). Add a **synthetic palette item** (no catalog
  binding) that creates a `region` group. Multi-region = sibling region backdrops.
- **AZ** — CAML already has the `zone` groupKind; introduce it as a **container layer
  between VPC and subnet**: `region ⊃ vpc ⊃ az(zone) ⊃ subnet`. AZ backdrop is **lighter
  than VPC** (smaller title, fainter wash). Synthetic AZ palette item. Templates (multi-AZ
  HA) re-scaffolded to nest subnets under AZs.
- Supports single-AZ, multi-AZ, multi-region from the same model; backdrops stack by depth.

## 4. Subnet purpose awareness

Extend the subnet model beyond public/private (Day 59) with a **role**: `web` · `app` ·
`data` · `shared` · `management` · `transit`. Source from `properties.role` (or infer from
members: a subnet with only databases → `data`). Role drives:
- the lane **label** ("Private · App", "Public · Web"),
- **tier ordering** (web→app→data left-to-right), and
- **tint** (reuse `SUBNET_TINT`, role-modulated).

## 5. Resource category rendering rules

Each category gets a distinct treatment (extends the relationship-render model):

| Category | Treatment | Status |
|---|---|---|
| Region / VPC / AZ / Subnet | **Backdrops / lanes** | washes done; backdrop layer = new (§1) |
| Compute (EC2/ECS/EKS/Lambda/ASG) | **Primary nodes** | done (icon-forward) |
| Storage (EBS/EFS) | **Attachments** (compartments) | done (folding) |
| Security (SG/IAM/KMS) | **Metadata badges** | done (chips) |
| Networking (Route table/NACL/Endpoints) | **Overlays** — NACL = VPC-level chip on subnets; endpoints = VPC-level; route tables = overlay | refine (§6/§7) |
| **Network links** (Peering/TGW/VPN/DC) | **Specialized connectors** between VPCs (not boxes) | **new (§ connection)** |
| Observability (CloudWatch/X-Ray) | **Sidecars** — a small monitor glyph docked to the watched node, not a flow node | **new** |
| AI (Bedrock/KB/OpenSearch) | **Service nodes** (distinct accent) | needs catalog (Phase 2C-sidebar) |

## 6. Networking placement refinements

- **Gateway endpoints → VPC-level** (route-table targets, no ENI): containment moves from
  subnet to VPC; render as a VPC-level chip/overlay. Update `containment.ts` so
  `network.endpoint.private` with the gateway service nests at VPC, interface endpoints stay
  in a subnet (they have an ENI — NET-001 already enforces this).
- **NACL → VPC-level, associated with subnets**: instead of folding onto one subnet (Day 55),
  model NACL as a VPC-level construct with **subnet associations** (a NACL-Public applied to
  public subnets). Render as an edge-level/lane-edge security marker, not a subnet child.

## 7. Connection system redesign

- Keep the semantic kinds + Day-61 desaturated styling. Improve **routing**: tune ELK
  orthogonal routing + port sides now that backdrops free the graph (fewer bends, shorter
  paths, cleaner intersections).
- **Network-link folding (new):** a `network.link.peering` / `gateway.transit` /
  `gateway.vpn` / `link.direct` component that joins two `network` groups folds into a
  **specialized connector between the VPC backdrops** — `VPC A ◄══ peered ══► VPC B` — and
  the component box disappears (analogous to attachment folding, but it produces an edge,
  not a badge). Double-arrow for peering, labeled per link type.

## 8. Architecture view system

Four views generated from one model (a `view` mode that filters/abstracts before projection):

| View | Shows | Hides |
|---|---|---|
| **Resource** (default-ish) | everything incl. SG/NACL/IAM/endpoints/route tables | — |
| **Architecture** | VPC/AZ/subnet, compute, data, network links | security badges, route tables, endpoints |
| **Executive** | collapsed: Users → Application → Data Platform (group by tier, hide instances) | all implementation detail |
| **Network** | route tables, NACLs, endpoints, TGW/VPN/peering, subnets | compute/data internals |

Implemented as a pure `applyView(model, view)` transform feeding `project()`; a toolbar
view switcher. Executive view aggregates compute into a single "Application" node and data
into "Data Platform".

## 9. Visual hierarchy

Visual weight order: **Flow > Workloads > Data > Context (containers) > Metadata.**
- Containers: very subtle (washes, hairlines — done).
- Resources: moderate emphasis (icon-forward — done).
- **Active/selected communication path: highest emphasis** — thicken + saturate the
  hovered/selected flow path and dim the rest (new: path highlight on hover/select).

## 10. Compact cards (further)

Push nodes 40–60% smaller than today: icon (20) + short name only, ~36px tall, category
accent as a left bar or tinted icon tile; attachments/badges only on the owner. Density
toggle (compact/comfortable) shared with the sidebar density work.

---

## 11. Before / After

```
BEFORE (today — nested containers)            AFTER (composed architecture)
┌ us-east-1 ─────────────────────────┐        us-east-1 ······························
│ ┌ VPC ───────────────────────────┐ │         VPC ·····································
│ │ ┌public┐        ┌private┐       │ │          ( • )    AZ-a              AZ-b
│ │ │ ALB  │        │ EC2   │       │ │         Internet  ┌web┐ ┌app┐       ┌web┐ ┌app┐
│ │ └──────┘        │ EBS   │       │ │            ══════▶ ALB ─▶ EC2 ──┐    ALB ─▶ EC2
│ │   (lots of empty space)         │ │                   └───┘ └─┬─┘  │    └───┘ └─┬┘
│ │              ┌ RDS ┐            │ │                          data  ▼           data
│ └─────────────────────────────────┘│                            ┌ RDS (multi-AZ) ┐
└─────────────────────────────────────┘                           (lanes = backdrops;
   long connectors, VPC dominates              flow L→R; containers are quiet context)
```

## 12. Figma-ready specification

| Token | Value |
|---|---|
| Region backdrop | wash `rgba(violet,0.025)`, no border, title `TYPE_SCALE.region` (16) muted, top-left |
| VPC backdrop | wash `rgba(blue,0.04)`, 1px `rgba(blue,0.18)`, corner label |
| AZ band | wash `rgba(slate,0.03)`, dashed 1px, label 11/600 muted — lighter than VPC |
| Subnet lane | `SUBNET_TINT` public/private + role label |
| Backdrop z-index | region −40 · vpc −30 · az −20 · subnet −10 · edges 0 · nodes 10 · overlays 20 |
| Node (compact) | 36px h, icon 20, short name 13/600, category accent bar 3px |
| Link connector | double-arrow, neutral, label pill ("peered", "transit", "vpn") |
| Sidecar (obs) | 16px glyph docked top-right of the watched node |
| Path highlight | selected/hovered flow: stroke 2.5 + full saturation; others 40% opacity |
| Spacing | 8px grid; ELK layer gap 56, node gap 28 |

---

## 13. Roadmap (Stage H Phase 2C)

Sequenced **before** the sidebar (Phase 2C-sidebar) per "account for these before Day 69":

1. **Backdrop-layer rendering pipeline** — containers from member bounding boxes; z-order; `GroupNode` → backdrop. *(foundation — unblocks the rest)*
2. **Layout engine v2** — lay out the flow graph (leaves + comms edges); derive backdrops; minimize connector length; promote Flow to archetype default.
3. **AZ container layer** + synthetic Region/AZ palette items; re-scaffold multi-AZ templates.
4. **Subnet role awareness** (web/app/data/shared/mgmt/transit) → labels + lane ordering.
5. **Network-link folding** (peering/TGW/VPN/DC → specialized connectors between VPCs).
6. **Networking placement** (gateway endpoint @ VPC, NACL @ VPC + subnet associations).
7. **Category treatments** (observability sidecars, networking overlays) + further card compaction + path highlight.
8. **Architecture layer bands** (EDGE/NETWORK/COMPUTE/DATA/SECURITY/OBS) as a view.
9. **Architecture view system** (Resource / Architecture / Executive / Network) via `applyView`.
10. **Golden review** (member-cohesion + max-edge-length assertions) + before/after + deploy.

**Risk note:** items 1–2 are the deep rendering change deferred since Day 62 (backdrop
decoupling). They are the highest-value and highest-risk; everything else composes on top.
Recommend building behind a flag / on templates first, with heavy golden tests, since
layout can't be eyeballed in CI.
