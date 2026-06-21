# Amazon Connect / Contact Center Architecture Domain

**Status:** spec / source-of-truth for the Contact Center + Voice-AI domain (Stage H
Phase 3A). **Scope:** CAML schema (`schemas/caml-1.0.schema.json` + generated types),
catalog (`catalog/services/aws/*` + new providers), `relationships.ts`, `projector.ts`,
layout/templates, and a new **Contact Flow workflow view**. Builds on
[`aws-relationship-model.md`](./aws-relationship-model.md) and
[`canvas-composition.md`](./canvas-composition.md). Canonical plan: `BUILD-PLAN.md`.

**Goal:** model enterprise contact centers semantically — an **Amazon Connect Instance is a
container** (like a VPC) holding flows / queues / routing profiles / agents — and compose
diagrams that read like AWS contact-center solution architectures (Connect + Lex / Bedrock /
LiveKit / Pipecat / RAG), including real-time **voice-AI media pipelines** and **contact-flow
orchestration**.

**Hard dependency:** none of these services exist in the catalog today (it's 61 AWS infra
services). This domain needs new CAML taxonomy + catalog content + (for flows) a new render
mode. It reuses the Phase-2C composition engine (layered layout, backdrops, views) and the
Phase-2D catalog-expansion mechanics.

---

## 1. Amazon Connect domain model

`Amazon Connect Instance` is a **container** (new `groupKind: connect`) inside a Region:

```
Region
└── Amazon Connect Instance            (container — Connect-orange backdrop)
    ├── Contact Flows        ├── Queues          ├── Routing Profiles
    ├── Agents / Workspace   ├── Quick Connects  ├── Hours of Operation
    ├── Prompts              ├── Customer Profiles├── Contact Lens
    ├── Voice ID             ├── Amazon Q (Wisdom)├── Tasks / Cases
    └── (Lex bots, Knowledge Base referenced from flows)
```

The instance backdrop visually owns its resources (same mechanism as VPC⊃subnet, Phase 2C
backdrops). Channels enter from the left; AI/Apps/Data/Analytics layer out to the right
(see §8 storytelling).

## 2. Component hierarchy (new taxonomy)

New CAML component-type branches (added to the schema type enum):

| Branch | Types |
|---|---|
| **contactcenter.** | `instance`* · `flow` · `queue` · `routing_profile` · `agent` · `agent_workspace` · `quick_connect` · `hours` · `customer_profiles` · `contact_lens` · `voice_id` · `wisdom` · `task` · `case` · `phone_number` |
| **channel.** | `voice` · `chat` · `sms` · `whatsapp` · `email` · `webrtc` · `mobile_sdk` · `web_client` — *customer entry points* |
| **telephony.** | `pstn` · `did` · `sip_trunk` · `sip_provider` · `carrier` · `sbc` · `voice_gateway` · `livekit_sip` |
| **ai.** | `bot` (Lex) · `model.foundation` (Bedrock) · `search` (Kendra) · `knowledge_base` · `transcribe` · `polly` · `comprehend` · `llm.custom` · `llm.external` (OpenAI/Anthropic) |
| **voiceai.** | `livekit` · `pipecat` · `agent` · `stt` · `tts` · `vad` · `rag` · `vector_db` |
| **flowblock.** | `play_prompt` · `get_input` · `invoke_lambda` · `transfer_queue` · `transfer_agent` · `disconnect` · `check_hours` · `check_queue` · `lex` · `api_call` · `branch` · `error` — *contact-flow logic (workflow view only, §6)* |

`instance`* materializes as the **group** (`groupKind: connect`), not a component. `ai.*` is
shared with the GenAI domain (Phase 2D).

## 3. Relationship model (new classes)

Extend `classifyRelationship` with Contact-Center classes, derived from endpoint types +
connection `kind`. Only **three new CAML `kind`s** are needed; the rest reuse existing kinds:

| New class | CAML `kind` | Example | Render |
|---|---|---|---|
| **ROUTES_TO** | `route`* | flow → queue, queue → routing profile | solid teal, routing arrow |
| **TRANSFERS_TO** | `route`* | flow → agent / queue | solid teal, labeled "transfer" |
| **INVOKES** | `invoke`* | flow → Lambda / Lex | dashed indigo |
| **STREAMS_AUDIO_TO** | `stream`* | Connect → LiveKit → Pipecat | **thick animated** (real-time media) |
| **USES_KNOWLEDGE_BASE** | `data` | agent workspace → KB; Pipecat → RAG | dashed green |
| **AUTHENTICATES_WITH** | `identity` | contact → Voice ID | identity (folded badge) |
| **ANALYZES** | `observability` | Contact Lens → contacts | dotted, monitoring |
| **GENERATES_EVENTS / PUBLISHES_TO / SUBSCRIBES_TO** | `async` | Connect → EventBridge → Lambda | async dotted |

`*` = new connection kinds (`route`, `invoke`, `stream`) added to the CAML kind enum +
`edgeStyle`/legend + `CONNECTOR_KINDS`. Telephony links (Carrier→DID→Connect) use `route`
styled as **telephony connectors**, not network lines.

## 4. Data model changes

- **Schema (`caml-1.0.schema.json` + regen):** add `groupKind: connect`; add the §2
  component types to the type enum; add connection kinds `route` · `invoke` · `stream`.
  Backward compatible (additive enum members).
- **Catalog:** new service YAMLs for every §2 component (icons, properties, connection
  rules), under `catalog/services/aws/connect/*` and `.../voiceai/*`; non-AWS providers
  (LiveKit, Pipecat, OpenAI/Anthropic) need a `generic`/`thirdparty` provider (the catalog
  key pattern already allows `generic.*`). Run the Day-48 lint over the new rules.
- **`relationships.ts`:** extend `classifyRelationship` + `foldBucket` for the new classes;
  `AUTHENTICATES_WITH` (Voice ID) folds as an identity badge; the rest are connectors.
- **No breaking change** to existing infra models.

## 5. Visual rendering specification

| Element | Treatment |
|---|---|
| Connect Instance | container backdrop, **Connect-orange** wash (`#E7157B`/AWS Connect tint), distinct from VPC blue; large title |
| Connect resources (flow/queue/routing/agent) | primary nodes, Connect category accent |
| Channels (voice/chat/…) | **customer entry nodes** on the far left, rounded "entry" pills (like the Internet node) with a channel glyph |
| Telephony (carrier/DID/SIP/SBC) | nodes with a telephony glyph; links = `route` connectors styled as phone/trunk lines |
| AI (Lex/Bedrock/Kendra/KB) | AI **service nodes** (distinct violet accent) |
| Voice-AI (LiveKit/Pipecat/STT/TTS/LLM) | pipeline nodes; `stream` edges = **thick, animated, directional** (real-time media) |
| Contact Lens / analytics | observability sidecars / analytics-pipeline nodes |

## 6. Contact Flow rendering model (workflow view)

A Contact Flow is **orchestration, not infrastructure** — render it as a **flowchart sub-view**,
not as architecture nodes. A `contactcenter.flow` component is a node on the architecture
canvas; **double-click drills into** a dedicated Flow view:
- `flowblock.*` nodes in a top-down/left-right **workflow** layout.
- **Branch/decision** edges (labeled: matched intents, hours open/closed, queue full) and a
  distinct **error path** edge style.
- Block palette (Play Prompt, Get Input, Invoke Lambda, Transfer, Lex, Branch, …).
- The flow's external calls (Lambda/Lex/Bedrock) link back to the architecture model.
Implemented as a separate projection mode over the flow's block sub-graph (the flow stores
its blocks + branch edges as a nested model). This is effectively a second, lightweight
editor mode — the largest single piece of this domain.

## 7. Voice-AI rendering model (real-time media pipeline)

Voice-AI paths render as a **linear left-to-right media pipeline** with `stream` edges:
```
( 📞 Customer ) ══▶ [Amazon Connect] ══▶ [LiveKit] ══▶ [Pipecat] ══▶ [Bedrock]
( 📞 Customer ) ══▶ [SIP Provider] ══▶ [LiveKit SIP] ══▶ [Pipecat] ══▶ [LLM]
```
`stream` edges are thick, directional, subtly animated (distinct from request/data). A
"media-pipeline" auto-layout (§8) ranks the pipeline strictly horizontally and keeps STT/
TTS/VAD/RAG as sidecars on the agent node.

## 8. Auto-layout algorithms

New archetypes (extend the Phase-2C archetype engine + `tierRank`):
- **Contact Center (layered):** Channels → Connect → Routing & Orchestration → AI Services →
  Applications → Data → Analytics (left-to-right bands).
- **Media pipeline (linear):** strict horizontal rank for `stream` chains; sidecars docked.
- **Contact flow (flowchart):** top-down workflow with branch lanes + error path (flow view).

`tierRank` gains contact-center tiers: channel=0, connect=1, routing=2, ai=3, app=4, data=5,
analytics=6. Telephony nests left of channels.

## 9. Example architectures (templates)

Ship as one-click templates (`templates.ts` + the Day-72 `mergeTemplate`):
1. **Basic Contact Center** — Channels → Connect (flows/queues/routing/agents).
2. **Contact Center + Lex** — flow → Lex bot.
3. **Contact Center + Bedrock** — flow → Bedrock (+ guardrails).
4. **Contact Center + Knowledge Base** — agent workspace → KB → OpenSearch.
5. **Contact Center + LiveKit** — Connect → LiveKit (WebRTC media).
6. **Contact Center + Pipecat** — Connect → LiveKit → Pipecat → Bedrock.
7. **Contact Center + RAG** — Pipecat → RAG → vector DB → KB.
8. **Agent Assist** — Contact Lens + Wisdom/Q + KB to the agent workspace.
9. **Voice Bot** — Customer → Connect → Lex/Bedrock, no human agent.
10. **Omnichannel** — voice + chat + SMS + WhatsApp + email → one Connect instance.
11. **Enterprise Contact Center** — multi-region Connect, telephony (carrier/SIP/SBC),
    AI layer, analytics pipeline (Contact Lens → S3 → Athena → QuickSight).

## 10. UX recommendations

- **Connect as a drop-target container:** dropping flows/queues/agents onto a Connect
  Instance nests them (same gesture as dropping into a VPC).
- **Drill-in for flows:** double-click a Contact Flow → workflow editor; breadcrumb back to
  the architecture.
- **Domain palette sections** (ties to the sidebar redesign, Phase 2D): 🎧 Contact Center ·
  ☎️ Telephony · 💬 Channels · 🤖 AI · 🎙 Voice-AI — each a collapsible domain.
- **Channel entry points** always render leftmost (customer-first reading).
- **Views** (Phase-2C view system): a **Telephony view** (carrier→DID→Connect), an **AI/
  Voice view** (the media + LLM pipeline), and an **Executive view** (Customer → Connect →
  AI → Agents).
- **Scale:** large CC architectures use the layered auto-layout + collapsible Connect
  containers + per-flow drill-in so a single canvas stays legible.

---

## 11. Roadmap (Stage H Phase 3A)

This **supersedes the thin Contact Center / GenAI slot** in Phase 2D (Days 85–87) with a
full domain phase. Sequenced after the canvas-composition engine (Phase 2C) and the
catalog-expansion mechanics (Phase 2D 79–84 sidebar UI), since it reuses both.

1. **Taxonomy + schema** — add `groupKind: connect`, the §2 component types, and kinds
   `route`/`invoke`/`stream`; regenerate CAML types; extend `edgeStyle`/legend.
2. **Relationship classes** — extend `classifyRelationship`/`foldBucket` for the 10 CC
   classes (+ Voice-ID identity fold); render styles per kind.
3. **Catalog — Core Connect** — instance(group) + flow/queue/routing/agent/workspace/
   quick-connect/hours/prompts/customer-profiles/contact-lens/voice-id/wisdom/tasks/cases.
4. **Catalog — Telephony + Channels** — PSTN/DID/SIP/carrier/SBC/voice-gateway/livekit-sip
   + voice/chat/SMS/WhatsApp/email/webrtc/mobile/web (channel entry nodes).
5. **Catalog — AI + Voice-AI** — Lex/Bedrock/Kendra/KB/Transcribe/Polly/Comprehend +
   LiveKit/Pipecat/STT/TTS/LLM/VAD/RAG/vector-db (incl. `generic`/`thirdparty` provider).
6. **Connect container + composition** — Connect-as-backdrop, channel entry nodes, telephony
   + `stream` media-pipeline connectors; CC layered auto-layout + `tierRank` tiers.
7. **Contact Flow workflow view** — drill-in flowchart editor (flowblocks + branch/error
   edges). *Largest piece — its own sub-effort.*
8. **Templates** — the 11 §9 architectures via `mergeTemplate`.
9. **Views** — Telephony / AI-Voice / Executive contact-center views (`applyView`).
10. **Golden review + deploy** — lint new rules, golden tests over the CC templates, deploy.

**Risk:** this is the largest single domain in the plan. The **Contact Flow workflow view**
(7) is effectively a second editor and could be split out. Recommend shipping **3–6**
(model + composition: a Connect architecture that lays out and reads correctly) first, then
**7** (flow drill-in) and **8–9** (templates + views).
