# 16 — Baseline Validation Rule Pack (v1 specification)

The baseline pack ships in Phase 3 (~150 rules). This document specifies the rule
format, the full v1 rule inventory, and complete specs for eight representative rules —
one per implementation pattern — so the engine and the first 20 rules can be built
without further design work.

## Rule Anatomy

```yaml
id: SEC-012                       # stable forever; never reuse retired IDs
title: Database reachable from internet-facing component
category: security                # reliability|security|performance|cost|operations
severity: critical                # critical|high|medium|low|info
engine: graph                     # cel | graph | composite
appliesTo: { typePrefix: "database." }
expression: ...                   # CEL source or Cypher template (below)
params:                           # tunable per tenant / per policy
  allowedIntermediaries: [network.firewall.waf, network.gateway.api]
message: "{{db.name}} is reachable from internet-facing {{entry.name}} via {{path}}"
remediation:
  text: "Place a WAF or API gateway between the entry point and the database tier, or move the database to a private subnet."
  camlPatch: optional             # one-click fix when mechanically safe (see SEC-001)
evidence:                         # compliance pack hooks
  - { framework: pci-4.0, control: "1.3.1" }
  - { framework: cis-aws-1.5, control: "5.2" }
waivable: true
appliesWhen: { minComponents: 1 } # cheap pre-filter
since: pack/2026.10
```

**Two engines, one IR:**
- `cel` rules — per-component/per-connection predicates over the flattened model
  (fast, run in-process, ~80% of rules).
- `graph` rules — Cypher templates against the commit's Neo4j projection
  (reachability, redundancy, articulation points).
- `composite` — CEL aggregation over another rule's output (e.g. "more than 3 cost
  warnings of kind X ⇒ architectural smell").

Severity discipline (false positives are the product killer, doc 12): `critical` is
reserved for "would fail a real audit / cause an outage class incident"; anything
heuristic ships as `medium` or below until field data earns an upgrade.

## v1 Rule Inventory

### Reliability (REL-001 … REL-034)

| ID | Sev | Rule | Engine |
|---|---|---|---|
| REL-001 | critical | Stateful component (database.\*, storage.block) in a single zone while a `reliability.redundancy` policy or availability requirement ≥ 99.9% exists | cel |
| REL-002 | critical | Single point of failure: component whose removal disconnects user-facing entry from a critical-criticality component (articulation point) | graph |
| REL-003 | high | Load balancer with only one backend target | graph |
| REL-004 | high | `database.relational` with `replicas: 0` and criticality ∈ {critical, high} | cel |
| REL-005 | high | No DR posture: requirement `rpo_rto` present but no replication connection crossing region groups | composite |
| REL-006 | high | Queue (`messaging.queue`) without DLQ where consumer is serverless | cel |
| REL-007 | medium | Autoscaling group with min == max (scaling configured but pinned) | cel |
| REL-008 | medium | Cache (`database.cache`) is the only path between compute and a datastore (cache-as-SoR anti-pattern) | graph |
| REL-009 | medium | Cross-region dependency on a single-region service (e.g. multi-region compute → one-region DB without replica) | graph |
| REL-010 | medium | Component `count: 1` for compute.vm serving `traffic` from a load balancer | cel |
| REL-011 | high | `storage.object` bucket with `versioning: false` holding dataClassification ≥ confidential | cel |
| REL-012 | medium | Synchronous chain depth > 4 between user entry and deepest dependency (cascading failure risk) | graph |
| REL-013 | low | No health-check property on LB targets | cel |
| REL-014–034 | — | Backup presence/retention/PITR per store type, multi-AZ flags per service, NAT gateway per-AZ redundancy, DNS failover config, zone-spread for ASGs, stream consumer lag alarms, etc. | mixed |

### Security (SEC-001 … SEC-042)

| ID | Sev | Rule | Engine |
|---|---|---|---|
| SEC-001 | critical | Datastore with `storageEncrypted/atRest: false` (or absent where catalog default ≠ encrypted) | cel |
| SEC-002 | critical | Database reachable from internet-facing component without WAF/API-gateway intermediary | graph |
| SEC-003 | critical | `network.firewall.network` rule equivalent of 0.0.0.0/0 on a non-LB, non-CDN component (modeled or discovered) | cel |
| SEC-004 | critical | Public subnet contains a datastore (`database.*`, `storage.block`) | cel |
| SEC-005 | high | Connection with `encrypted: false` crossing a group boundary (network → network) | cel |
| SEC-006 | high | Component handling `restricted` data with no `identity` connection (no authn modeled) | graph |
| SEC-007 | high | Secrets-shaped property values inline (`password`, `key` matching entropy heuristics) instead of `security.secrets` reference | cel |
| SEC-008 | high | No `security.keys` (KMS) component while ≥1 policy demands CMK encryption | composite |
| SEC-009 | high | Internet-facing entry without WAF/DDoS component in path | graph |
| SEC-010 | medium | mTLS absent on service-to-service `traffic` connections within a cluster tagged zero-trust | cel |
| SEC-011 | medium | IAM principal (`security.identity`) with `identity` edges to > N components (over-privileged hub) | graph |
| SEC-012 | medium | Cross-account connection (`account` group boundary) without explicit identity edge | graph |
| SEC-013 | medium | `authentication: none` on any non-public connection | cel |
| SEC-014–042 | — | TLS min-version, public object storage flags, certificate components near expiry-unmanaged, audit-log component absence, VPC endpoints for sensitive SaaS paths, exposure of management protocols, residency vs `data_residency` requirement, etc. | mixed |

### Performance (PERF-001 … PERF-021)

| ID | Sev | Rule | Engine |
|---|---|---|---|
| PERF-001 | high | Fan-in bottleneck: component receiving `traffic` from ≥4 upstream services with `scaling.mode: none` | graph |
| PERF-002 | high | `expectedRps` on inbound connections exceeds catalog throughput ceiling for the bound service/size | cel |
| PERF-003 | medium | Relational DB serving read-heavy profile (requirement throughput high) with no cache and no read replicas | composite |
| PERF-004 | medium | Cross-region synchronous `traffic`/`data` connection on user-facing request path (latency budget) | graph |
| PERF-005 | medium | Serverless function in a network group with NAT egress on a high-RPS path (cold-start + NAT cost/latency) | graph |
| PERF-006 | low | CDN absent in front of `storage.object` serving `user.browser` traffic | graph |
| PERF-007–021 | — | Queue depth vs consumer scaling, connection pool exhaustion heuristics (lambda→RDS without proxy), instance family vs workload tags, etc. | mixed |

### Cost (COST-001 … COST-018)

| ID | Sev | Rule | Engine |
|---|---|---|---|
| COST-001 | high | Estimated monthly cost exceeds `budget` requirement | composite |
| COST-002 | medium | NAT gateway on a path with high `bandwidthMbps` (egress trap — suggest endpoints/peering) | graph |
| COST-003 | medium | Overprovision heuristic: instanceClass ≥ 4xlarge with `scaling.mode: none` and no throughput requirement justifying it | cel |
| COST-004 | medium | Multi-AZ + global database on non-critical component (gold-plating) | cel |
| COST-005 | low | Storage without lifecycle/archive policy where dataClassification ≤ internal | cel |
| COST-006 | low | Dev/staging deployment overrides absent (prod-sized everywhere) | cel |
| COST-007–018 | — | Idle-shaped LBs (no targets), duplicate cache layers, cross-AZ chatty pairs, provisioned-vs-serverless fit by usage profile, missing commitment-plan candidates (emitted as info with savings estimate), etc. | mixed |

### Operations (OPS-001 … OPS-025)

| ID | Sev | Rule | Engine |
|---|---|---|---|
| OPS-001 | high | Critical component with `operations.monitoring` absent or all-false | cel |
| OPS-002 | high | Datastore with `operations.backup.enabled: false` and criticality ≥ high | cel |
| OPS-003 | medium | No `observability.*` component in an architecture > 10 components | composite |
| OPS-004 | medium | No alert intents on user-facing entry components | cel |
| OPS-005 | medium | `patching: manual` on internet-reachable compute | composite |
| OPS-006 | low | Untagged components (no `metadata.tags` inheritance) > 50% | cel |
| OPS-007–025 | — | Log retention vs compliance packs, trace coverage on request paths, runbook annotation presence for critical components, single-account blast radius (prod+dev same account group), etc. | mixed |

### Document-policy rules (POL-\*)
Every `policies[]` entry in the model itself compiles to a parameterized instance of the
rules above (doc 05: `security.encryption` → SEC-001 scoped by `appliesTo`). Tenant
custom policies (enterprise) register new CEL/Cypher rules through the same format.

## Eight Fully-Specified Representative Rules

### SEC-001 — Unencrypted datastore (pattern: simple CEL + auto-fix patch)
```yaml
engine: cel
expression: |
  component.type.startsWith("database.") || component.type == "storage.object"
    ? (has(component.properties.storageEncrypted)
        ? component.properties.storageEncrypted == true
        : catalog.defaultOf(component.binding.service, "storageEncrypted") == true)
    : true
remediation:
  camlPatch:                       # mechanically safe → one-click fix offered
    - { op: replace, path: "/components/{idx}/properties/storageEncrypted", value: true }
evidence: [{framework: cis-aws-1.5, control: "2.3.1"}, {framework: pci-4.0, control: "3.5"},
           {framework: hipaa, control: "164.312(a)(2)(iv)"}]
```

### SEC-002 — Internet-reachable database (pattern: graph reachability with allowlisted intermediaries)
```cypher
MATCH (entry:Component {commit_hash: $hash})
WHERE (entry)-[:IS_A]->(:CloudService {internet_facing: true})
   OR entry.type IN ['user.browser','external.partner_system']
MATCH path = (entry)-[:CONNECTS_TO*1..6]->(db:Component)
WHERE db.type STARTS WITH 'database.'
  AND none(n IN nodes(path)[1..-1] WHERE n.type IN $params.allowedIntermediaries)
RETURN entry, db, [n IN nodes(path) | n.ref] AS evidence_path
```
Finding emitted per (entry, db) pair, deduplicated by shortest path. Not auto-fixable —
remediation text offers two alternatives (insert WAF / privatize subnet) as suggested
AI actions, each generating a reviewable patch via the Repair agent.

### REL-002 — Single point of failure (pattern: graph algorithm, not pattern-match)
Computed via articulation-point analysis (GDS `alpha.articulationPoints` or in-process
Tarjan on the projected graph) restricted to the subgraph between `user.*` entries and
components with `criticality: critical`. `count > 1` or membership in an autoscaling
group exempts a node. Severity downgraded to `high` if the SPOF is a managed-HA service
per catalog (`ha.mechanism != none`) — the service is logically single but physically
redundant.

### REL-005 — DR posture vs RPO/RTO (pattern: composite — requirement-driven)
```yaml
engine: composite
appliesWhen: { hasRequirement: rpo_rto }
expression: |
  req := requirements.first(kind == "rpo_rto")
  regionGroups := groups.filter(kind == "region").size()
  crossRegionRepl := connections.exists(kind == "replication" && crossesGroupKind("region"))
  // RPO ≤ 15min demands ≥2 regions and replication edges
  !(req.quantity.rpo_minutes <= 15 && (regionGroups < 2 || !crossRegionRepl))
message: "RPO of {{req.quantity.rpo_minutes}}m declared, but {{#if regionGroups < 2}}only one region modeled{{else}}no cross-region replication exists{{/if}}"
```

### PERF-002 — Throughput ceiling (pattern: catalog-data-driven CEL)
The catalog stores per-service throughput envelopes (e.g. `aws.lambda` concurrent
executions, ALB LCU ceilings, Aurora connection limits by instance class). The rule sums
`expectedRps` over inbound `traffic`/`data` edges and compares with the envelope for the
component's bound size. Emits `high` at >80% of ceiling, `medium` at >60%. Skips
silently when no `expectedRps` is modeled anywhere (no guessing).

### COST-002 — NAT egress trap (pattern: graph + cost-engine join)
Graph finds `* → network.gateway.nat → external/internet` paths carrying
`bandwidthMbps`; cost engine prices the egress at the modeled bandwidth; finding fires
only if estimated NAT data processing > $200/mo and a private endpoint alternative
exists in the catalog for the destination (`equivalent endpoint available: true`).
Message includes the dollar delta — cost rules must always show money, not ideology.

### OPS-001 — Monitoring gap (pattern: simple CEL, criticality-weighted)
Fires `high` for critical components, `medium` for high-criticality, `info` otherwise.
Demonstrates severity modulation by model attributes — one rule, not three.

### COST-001 — Budget breach (pattern: cross-service composite)
Validation engine calls the Cost Service (`GET /v1/cost/estimate/{commitHash}` — cached,
same commit-keyed determinism) and compares against the `budget` requirement. This is
the only rule class with a service dependency; it degrades to `skipped (cost
unavailable)` rather than failing the report.

## Report Determinism & Performance Contract

- Report = pure function of `(commit_hash, pack_version, params, waivers)` — cached
  forever, recomputed only on new pack releases (nightly re-scan of branch heads emits
  `validation.completed` deltas → "your architecture has new findings since pack 2026.11").
- Budget: ≤ 500 components ⇒ synchronous < 2s (CEL rules ~50ms total; graph rules
  batched into ≤ 6 Cypher round-trips); larger models async with progress events.
- Every rule ships with: 3+ positive fixtures, 3+ negative fixtures, 1 waiver fixture —
  pack CI runs the full fixture corpus plus a false-positive regression suite harvested
  from real waived findings (a waiver with reason "false positive" auto-files a rule bug).
