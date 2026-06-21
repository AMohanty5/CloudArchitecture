# Canvas Visual Redesign — Presentation-Quality Architecture Diagrams

**Status:** spec / source-of-truth for the Phase-2 visual overhaul (see Roadmap below).
**Scope:** the web canvas rendering system — `apps/web/src/canvas/` (`theme.ts`,
`projector.ts`, `layout.ts`, `ServiceNode.tsx`, `GroupNode.tsx`, `Canvas.tsx`,
`connections.ts`). Extends blueprint doc 06 (canvas architecture).

**Goal:** transform the diagram from "technically-correct nested boxes that look
auto-generated" into a clean, presentation-quality blueprint on par with AWS
Architecture Center, Cloudcraft, Lucidchart Enterprise, Stripe engineering diagrams,
and modern Figma architecture templates. A viewer should grasp the architecture in
**≤ 5 seconds** and think *"this is a reference architecture,"* not *"this is a diagram
tool's output."*

---

## 1. Diagnosis of the current render

From the 3-tier render, tied to the code that produces it:

| Symptom | Cause |
|---|---|
| 4 concentric heavy boxes (region▸vpc▸subnet▸service) | `GroupNode.tsx` renders every container as a `1.5px solid` bordered box with a full-width tinted **header bar** + bottom border |
| Service cards look like dashboard widgets | `NODE = {width:172, height:54, iconSize:30}` (`theme.ts`) — wide card, 12px name, always-on 9.5px role subtitle |
| Connectors heavier than services, looping around boxes | ELK routes edges *around* hard nested group boundaries (`layout.ts` `INCLUDE_CHILDREN` + subnet padding); large arrowheads |
| Cramped vertical column, dead canvas on the left | all tiers nest inside one AZ subnet stack, so `layered-lr` collapses to vertical; no "Internet" origin |
| 3 competing container hues | region violet + VPC blue + subnet teal at similar saturation, fighting the service icons |

**Root cause:** containers are modeled as first-class bordered *objects* equal in weight
to services. The fix is to demote them to *context* (washes + lanes) and promote
services.

## 2. Design principles

- Reduce visual clutter ≥ 70%.
- Communicate structure with **hierarchy and whitespace**, not borders.
- Services are the primary focus; infrastructure boundaries are context.
- Favor grouping over boxing; storytelling over object-modeling.
- One primary **flow axis** (LR) with an explicit entry origin ("who enters?").

The viewer's eye should follow: **flow → service layers → service nodes → boundaries →
metadata** (today's render inverts this, emphasizing boundaries first).

---

## 3. Component redesign — icon-forward nodes

Target node (matches Cloudcraft / AWS reference style):

```
   ┌──────┐          • Category-tinted rounded icon tile, 44px, white AWS glyph
   │ ▟▙   │  44px    • NO card border; only a soft shadow on the tile
   │  EC2 │          • Name BELOW, centered, 13–14px / 600 / dominant
   └──────┘          • Role/metadata REMOVED from canvas → hover tooltip + inspector
   App tier          • Optional 2px category underline under the tile
```

| Token | Now | Proposed |
|---|---|---|
| Node shell | 172×54 white card, `1px` border | borderless; icon tile 44px + label beneath |
| Icon | 30px, left in card | 44px tile, top-center, category-tinted bg |
| Name | 12px / 600 | 13–14px / 600 — the loudest text |
| Role subtitle | always on, 9.5px | hidden → hover/inspector only |
| Selected | blue ring on card | blue ring on icon tile only |
| Footprint | 172×54 (~9300px²) | ~96×72, ~60% lighter ink |

## 4. Container redesign — context, not cages

| Container | Now | Proposed |
|---|---|---|
| **Region** | bordered box + violet header bar + `kind` suffix | no border; 2–3% wash backdrop; large light corner label `us-east-1`; no suffix |
| **VPC** | bordered box + blue header bar | 1px hairline at low opacity + 4% wash, 16px radius; corner label, no bar |
| **Subnet** | bordered teal box + header | **swimlane band**: full-width/height tint (public vs private), 1px dashed divider; tiny corner pill |
| **SG / route / NACL** | (more boxes) | never a box — a small chip on the node or a dotted hairline ring, shown only when relevant |

Encoded as tokens: container border opacity `0.45 → 0.12–0.18`; **header bar removed**;
body tint moves to a **monochrome slate/blue family** so service icons own the color.

## 5. Connector redesign

- Thin (1.5px) + desaturated. Only the **primary request path** uses the accent;
  everything else neutral slate.
- Smaller arrowheads; bidirectional = double-headed marker.
- Semantic styles (keep, refine): solid=traffic, dashed=data, dotted=async/observability,
  dash-dot=dependency.
- **Routing fix:** subnets become *lanes* (not hard ELK containers), so edges route
  straight across instead of detouring around box padding. Add ELK port-side constraints
  so traffic exits right / enters left along the flow axis.
- Labels off by default; small pill on hover.

## 6. Typography system (invert today's hierarchy)

| Level | Element | Now | Proposed |
|---|---|---|---|
| L1 | Region | 11px bar | 13px / 600 / muted — backdrop label |
| L2 | VPC / Subnet | 11px / 700 uppercase bar | 11px / 600, low-contrast corner pill |
| L3 | **Service name** | 12px / 600 | **13–14px / 600 — dominant** |
| L4 | Metadata | 9.5px always-on | 10px / muted, hover-only |

Scale on the 8px rhythm: **10 / 11 / 13 / 16**. Drop the `region`/`network`/`subnet`
kind suffix and the always-on role line.

## 7. Color system

- **Icons keep AWS category color** (`CATEGORY_COLOR` already correct: compute `#ED7100`,
  db `#C925D1`, storage `#7AA116`, net `#8C4FFF`, security `#DD344C`).
- **Containers go monochrome + faint:** region 2–3%, VPC 4%, subnet lanes 3–5%, all in a
  slate/blue family; no saturated header bars.
- **One accent** (blue) for the primary traffic path; everything structural is neutral.
  Net effect: the only saturated things on screen are the service icons.

## 8. Layout engine

Decouple **flow rank** from **subnet membership** (the cramped-column root cause):

- Keep ELK `layered` for ordering, but render region/VPC/subnet as **backdrop layers
  computed from node bounding boxes**, not as nesting that constrains routing.
- Introduce a virtual **entry node** ("Internet / Users") so flow has an origin.
- Add **tier ranks** (entry=0, edge=1, app=2, data=3) via layer constraints so
  LB→App→DB reads LR even across AZ subnets.
- After layout, `fitView` with padding so the diagram fills the viewport centered
  (today it floats to the right with dead space).

Render z-order (back→front): region wash → VPC wash → subnet lanes → edges → service
nodes → labels/chips.

## 9. Auto-layout archetypes

Extend `LAYOUT_PRESETS` from 4 generic ELK presets into named architecture archetypes
(direction + lane strategy + entry placement):

| Archetype | Shape |
|---|---|
| 3-Tier | LR: Internet → LB → App → Data; AZ = vertical lanes |
| Multi-AZ | mirror tiers across N AZ lanes, shared data tier |
| Microservices | gateway → service grid → per-service datastore |
| Event-driven | producers → central bus → consumers |
| Serverless | linear LR pipeline (API→Fn→store) |
| Data pipeline | stage lanes: ingest → process → store → serve |
| Hub-and-spoke | central TGW/hub, VPC spokes radial |
| GenAI / Contact-center | scaffolds with correct entry + tiers |

Each = ELK option overlay + lane-assignment function + entry node; archetype detection is
heuristic (LB+ASG+DB ⇒ 3-tier) or chosen from the layout menu.

## 10. Before / After + wireframes

```
BEFORE                                          AFTER
• 4 nested bordered boxes                        • 1 hairline VPC + 2 lane tints (region = wash)
• 172×54 icon+name+subtitle cards                • 44px icon tiles, name below, no subtitle
• edges loop around subnet boxes                 • straight LR edges across lanes
• vertical cram, right-shifted, empty left       • centered LR flow from an Internet origin
• 3 saturated hues + heavy headers               • neutral washes; color only in icons + 1 accent
• reads in ~20s, "auto-generated"                • reads in ~5s, "reference-architecture"
```

Redesigned 3-tier wireframe:

```
  us-east-1                                                              ◐ legend
 ┌··· Production VPC ································································┐
 ╎                       public · az-a                                       ╎
 ╎     ╭───────╮      ┌───────────────────────────────────────────────┐      ╎
 ╎     │   ◐   │ http ╎      ┌──────┐                                   ╎      ╎
 ╎     │Internet│════════════│ ALB  │══╗                               ╎      ╎
 ╎     ╰───────╯      ╎      └──────┘  ║                               ╎      ╎
 ╎                    └────────────────║──────────────────────────────┘      ╎
 ╎                       private · az-a║                                      ╎
 ╎                    ┌────────────────║──────────────────────────────┐      ╎
 ╎                    ╎   ┌──────┐◀════╝       ┌──────┐                ╎      ╎
 ╎                    ╎   │ EC2  │┄┄┄ data ┄┄▶│ RDS  │                ╎      ╎
 ╎                    ╎   └──────┘             └──────┘                ╎      ╎
 ╎                    ╎   App tier             Orders DB               ╎      ╎
 ╎                    └───────────────────────────────────────────────┘      ╎
 └······························································································┘
   ══ traffic   ┄┄ data        (lanes = dashed dividers, no boxes; VPC = faint wash)
```

Node states:

```
   selected                     hover (metadata appears)
   ┌────────┐                    ┌────────┐  ┌─────────────────────┐
   ║  ▟▙    ║  ← ring on tile    │  ▟▙    │  │ Auto Scaling group  │
   ║  EC2   ║                    │  EC2   │  │ t3.large · 2–6 inst │
   └────────┘                    └────────┘  └─────────────────────┘
   App tier                      App tier
```

---

## 11. Dark canvas option

A user-selectable **canvas theme** (light / dark), persisted as a global preference and
applied across the editor and exports (PNG/SVG). Dark mode is a first-class deliverable,
not an afterthought — the token system below defines both themes so every surface adapts.

**Behavior**
- Toolbar toggle (☀ / 🌙); persisted in `localStorage` (`cac:canvas-theme`).
- Affects: canvas pane background, grid dots, container washes/lanes, node tiles, text,
  connectors, shadows/elevation, and the title/legend overlays.
- Export honors the active theme (a dark deck export looks like the dark canvas).
- Default: **light** (matches AWS docs); dark targets dashboards, re:Invent-style decks,
  and presentation rooms.

**Why dark needs its own tokens, not an inversion:** on dark, drop-shadows disappear
(elevation must come from a lighter panel fill / hairline), low-opacity tints over white
become low-opacity light *glows* over dark, and AWS category colors must keep enough
luminance to pop. Connector and text colors lighten.

**v1 (canvas backdrop only — shippable immediately, no node rework):** pane background +
grid color switch to the dark tokens. Light service cards on a dark backdrop read as
intentional (the Cloudcraft-dark look). Full node/container dark theming lands with the
Phase-2 token rollout.

### Dark vs light tokens

| Surface | Light | Dark |
|---|---|---|
| Canvas pane bg | `#f8fafc` | `#0f172a` (slate-950) |
| Grid dots | `#e2e8f0` | `#1e293b` |
| Region wash | `rgba(violet,0.03)` | `rgba(violet,0.10)` (additive glow) |
| VPC wash | `rgba(blue,0.04)` | `rgba(blue,0.10)` |
| Subnet lane — public | `rgba(sky,0.04)` | `rgba(sky,0.10)` |
| Subnet lane — private | `rgba(slate,0.03)` | `rgba(slate,0.10)` |
| Container hairline | `rgba(base,0.18)` | `rgba(slate-300,0.22)` |
| Node tile bg | category tint | category tint (unchanged — pops on dark) |
| Node surface | `#ffffff` | `#111a2e` (panel) |
| Service name | `#1e293b` | `#e2e8f0` |
| Metadata | `#94a3b8` | `#64748b` |
| Connector — traffic | `#2563eb` | `#60a5fa` |
| Connector — data | `#059669` | `#34d399` |
| Connector — neutral | `#94a3b8` | `#64748b` |
| Selected ring | `rgba(37,99,235,0.18)` | `rgba(96,165,250,0.45)` |
| Elevation | soft drop-shadow | lighter panel fill + 1px hairline (no shadow) |
| Title / legend overlay | white pill | `#111a2e` pill, slate-200 text |

These belong in `theme.ts` as a `CANVAS_THEME[mode]` map so `ServiceNode`, `GroupNode`,
`Canvas`, and the backdrop layer all read from one source.

---

## 12. Token reference (theme.ts v2 — proposal)

- `TYPE_SCALE = { meta: 10, label: 11, name: 13, region: 16 }` on an 8px rhythm.
- `NODE = { tile: 44, radius: 10 }` (drop the 172×54 card).
- `CONTAINER = { borderAlpha: {region:0, vpc:0.18, subnet:0}, washAlpha: {region:0.03, vpc:0.04, subnetPublic:0.04, subnetPrivate:0.03} }`.
- `SHADOW.node` light = `0 1px 2px rgba(15,23,42,0.08)`; dark = none (use panel fill).
- `CANVAS_THEME = { light: {...}, dark: {...} }` (see §11 table).
- Keep `CATEGORY_COLOR` as-is (AWS-accurate).

---

## 13. Revised roadmap

> **Canonical day numbering + status lives in `docs/plan/BUILD-PLAN.md` → Stage H.** This
> section is the *visual detail*; if the two disagree, Stage H wins.

Phase 1 keeps the connectivity fixes (you can't attach what you can't connect — and the
container→lane change *is* the connectivity groundwork). Phase 2 delivers this spec.

**Phase 1 — Correctness & interaction (Days 51–55)**
- 51 ✅ **Done.** Reproduced & pinned via `apps/web/src/canvas/connect-repro.test.ts`:
  - **Blocker A (proven):** a component inside a `tier` section panel is rowified — `project()` emits no node for it, so it has no handle and can never be an edge endpoint.
  - **Blocker B (proven):** the rules for a freshly-dropped service are `undefined` until its React Query resolves, so the first connection attempts are rejected (async race).
  - **Not the blocker for the screenshot's subnet 3-tier:** there the verdict *allows* EBS↔EC2 / SG↔EC2 both ways, so any residual failure is in the React Flow DOM layer (nested-handle reachability) — to confirm in-browser at the start of Day 52.
- 52 Make grouped/nested components connectable (handles on rows; de-occlude nested handles).
- 53 Intuitive attachment UX (drop-onto-node ⇒ association edge; inspector "Attach…").
- 54 VPC endpoints: add Gateway Endpoint, relabel PrivateLink → Interface Endpoint, rules + lint.
- 55 Multi-subnet authoring (reliable drop-into-container, add-subnet affordance, move between subnets).

**Phase 2 — Visual system overhaul (Days 56–66)**
- 56 Design tokens v2 in `theme.ts` (type scale, monochrome washes, 8px grid, **light + dark `CANVAS_THEME`**).
- 57 `ServiceNode` v2 — icon-forward node; metadata → hover/inspector.
- 58 Container demotion — corner labels + washes replace bordered boxes/header bars.
- 59 Subnet swimlanes — backdrop lane bands from membership; unlocks straight routing.
- 60 Region/VPC backdrop layer + z-order pipeline + **dark canvas theme applied across all surfaces** (extends the v1 backdrop toggle).
- 61 Connector restyle — weights, desaturation, smaller arrows, port-side constraints.
- 62 Layout engine: decouple flow-rank from nesting + virtual Internet entry + fitView fill.
- 63 Archetypes I — 3-Tier, Multi-AZ, Serverless, Event-driven.
- 64 Archetypes II — Microservices, Data-pipeline, Hub-spoke, GenAI/Contact-center + detection.
- 65 Lightweight SG/route/endpoint indicators (chips) + legend/typography polish.
- 66 Golden-image review — re-render all 6 templates, before/after, export parity, CTO-deck pass.

**Phase 3 — Validation & polish (Days 67–68)**
- 67 Connectivity-doctor validation (endpoint-not-in-subnet, no NAT route, unreachable instance).
- 68 Full e2e regression of the three reported scenarios + the new visuals on a deployed build.

> **Shipped ahead of Phase 2:** a minimal dark-canvas backdrop toggle (pane bg + grid),
> token-driven so Day 60 extends it to every surface.

## 14. Open decisions

- **Metadata visibility (Day 53/57):** icon-forward node hides the role/type on canvas
  (hover/inspector only). Default = hover-only with a toggle; some review docs want type
  always visible. *To confirm with stakeholder.*
- **Archetype detection (Day 63):** auto-detect from topology vs. explicit user choice —
  recommend explicit choice first, auto-detect as an assist.
