# 05 — CAML: Cloud Architecture Modeling Language

**The DSL is the product.** Every feature reads or writes CAML. Design goals, in priority
order:

1. **Cloud-agnostic core, provider-precise leaves.** Components are typed by abstract
   capability (`compute.serverless.function`) AND optionally bound to a concrete service
   (`aws.lambda`) with typed properties. Abstract-only models support early-stage design
   and translation; bound models support IaC and cost.
2. **Human-diffable, machine-validatable.** YAML/JSON with a strict JSON Schema; stable
   IDs so diffs are semantic.
3. **Separation of model and presentation.** Layout lives outside the content hash.
4. **Progressive disclosure.** A valid model can be 10 lines (napkin sketch) or 10,000
   (production estate). Nothing required beyond id/type/name.

## Document Structure

```
ArchitectureDocument
├── camlVersion, id, name, metadata
├── requirements[]          # captured/inferred NFRs — what the design must satisfy
├── components[]            # the nodes
├── connections[]           # the edges
├── groups[]                # containment: regions, VPCs, subnets, tiers, logical zones
├── policies[]              # declarative constraints the model must uphold
├── deployments[]           # environment bindings (dev/stage/prod parameter sets)
└── annotations[]           # ADR links, review notes, freeform — non-semantic
```

## Example — abbreviated but real

```yaml
camlVersion: "1.0"
id: "arch_01HVX3K9"
name: "E-commerce Platform — US"
metadata:
  owner: team-commerce
  catalogVersion: "2026.06.1"
  tags: [production, pci]

requirements:
  - id: req-availability
    kind: availability
    statement: "99.95% for storefront"
    quantity: { slo: 0.9995 }
  - id: req-scale
    kind: scalability
    statement: "50M MAU, 30k peak RPS"
    quantity: { peak_rps: 30000 }

groups:
  - id: region-use1
    kind: region
    name: us-east-1
    provider: aws
  - id: vpc-main
    kind: network          # maps to VPC/VNet/VPC by provider
    parent: region-use1
    properties: { cidr: "10.0.0.0/16" }
  - id: subnet-public-a
    kind: subnet
    parent: vpc-main
    properties: { cidr: "10.0.1.0/24", zone: "us-east-1a", public: true }
  - id: subnet-app-a
    kind: subnet
    parent: vpc-main
    properties: { cidr: "10.0.10.0/24", zone: "us-east-1a", public: false }

components:
  - id: cdn
    type: network.cdn                  # abstract type (taxonomy path)
    binding: { provider: aws, service: aws.cloudfront }
    name: "Storefront CDN"
    properties: { priceClass: "PriceClass_All", waf: true }

  - id: api-lb
    type: network.loadbalancer.l7
    binding: { provider: aws, service: aws.alb }
    group: subnet-public-a
    properties: { scheme: internet-facing, tls: { minVersion: "1.2" } }

  - id: checkout-svc
    type: compute.container.orchestrator.service
    binding: { provider: aws, service: aws.eks_service }
    group: subnet-app-a
    properties:
      replicas: { min: 6, max: 60 }
      cpu: "2", memory: "4Gi"
    scaling: { metric: cpu, target: 60 }

  - id: orders-db
    type: database.relational
    binding: { provider: aws, service: aws.aurora_postgresql }
    group: subnet-app-a
    properties:
      engineVersion: "16"
      instanceClass: db.r6g.2xlarge
      multiAz: true
      encryption: { atRest: true, kmsKeyRef: "alias/orders" }
    operations: { backup: { retentionDays: 35, pitr: true } }

  - id: order-events
    type: messaging.queue
    binding: { provider: aws, service: aws.sqs }
    properties: { fifo: true, dlq: true }

connections:
  - id: c1
    from: cdn
    to: api-lb
    kind: traffic
    properties: { protocol: https, port: 443 }
  - id: c2
    from: api-lb
    to: checkout-svc
    kind: traffic
    properties: { protocol: https, port: 8443, mtls: true }
  - id: c3
    from: checkout-svc
    to: orders-db
    kind: data
    properties: { protocol: postgres, port: 5432, encrypted: true }
  - id: c4
    from: checkout-svc
    to: order-events
    kind: async
    properties: { pattern: publish }

policies:
  - id: pol-encrypt-all
    kind: security.encryption
    statement: "All data stores encrypted at rest with CMK"
    appliesTo: { typePrefix: "database." }
    enforce: error            # error|warn|info — validation engine consumes these
  - id: pol-no-public-db
    kind: security.exposure
    statement: "No database reachable from internet-facing components without WAF"
    enforce: error
  - id: pol-multi-az
    kind: reliability.redundancy
    statement: "Stateful services span ≥2 zones"
    appliesTo: { typePrefix: "database." }
    enforce: error

deployments:
  - id: prod
    environment: production
    overrides:
      - target: checkout-svc
        properties: { replicas: { min: 12, max: 120 } }
```

## JSON Schema (normative core — full schema ships as `caml-1.0.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.cloudarchitect.ai/caml/1.0",
  "type": "object",
  "required": ["camlVersion", "id", "name", "components"],
  "additionalProperties": false,
  "properties": {
    "camlVersion": { "const": "1.0" },
    "id":   { "type": "string", "pattern": "^arch_[A-Z0-9]{8,}$" },
    "name": { "type": "string", "maxLength": 200 },
    "metadata": { "type": "object" },
    "requirements": { "type": "array", "items": { "$ref": "#/$defs/Requirement" } },
    "components":  { "type": "array", "items": { "$ref": "#/$defs/Component" } },
    "connections": { "type": "array", "items": { "$ref": "#/$defs/Connection" } },
    "groups":      { "type": "array", "items": { "$ref": "#/$defs/Group" } },
    "policies":    { "type": "array", "items": { "$ref": "#/$defs/Policy" } },
    "deployments": { "type": "array", "items": { "$ref": "#/$defs/Deployment" } },
    "annotations": { "type": "array", "items": { "$ref": "#/$defs/Annotation" } }
  },
  "$defs": {
    "Id": { "type": "string", "pattern": "^[a-z][a-z0-9-]{0,63}$" },
    "Component": {
      "type": "object",
      "required": ["id", "type", "name"],
      "properties": {
        "id":   { "$ref": "#/$defs/Id" },
        "type": { "type": "string", "description": "Abstract taxonomy path, e.g. compute.serverless.function" },
        "binding": {
          "type": "object",
          "required": ["provider", "service"],
          "properties": {
            "provider": { "enum": ["aws", "azure", "gcp", "generic"] },
            "service":  { "type": "string", "description": "Catalog key, e.g. aws.lambda. Properties are validated against this service's catalog schema (second-pass validation)." }
          }
        },
        "name":  { "type": "string" },
        "group": { "$ref": "#/$defs/Id" },
        "properties": { "type": "object", "description": "Schema = catalog capability schema (abstract) merged with service schema (bound)" },
        "scaling":    { "type": "object" },
        "operations": { "type": "object", "description": "backup, monitoring, logging declarations" },
        "count": { "type": "integer", "minimum": 1, "default": 1 }
      }
    },
    "Connection": {
      "type": "object",
      "required": ["id", "from", "to", "kind"],
      "properties": {
        "id":   { "$ref": "#/$defs/Id" },
        "from": { "$ref": "#/$defs/Id" },
        "to":   { "$ref": "#/$defs/Id" },
        "kind": { "enum": ["traffic", "data", "async", "dependency", "replication", "peering", "identity"] },
        "direction": { "enum": ["uni", "bi"], "default": "uni" },
        "properties": { "type": "object" }
      }
    },
    "Group": {
      "type": "object",
      "required": ["id", "kind", "name"],
      "properties": {
        "id":   { "$ref": "#/$defs/Id" },
        "kind": { "enum": ["region", "zone", "network", "subnet", "tier", "domain", "account", "cluster", "custom"] },
        "name": { "type": "string" },
        "parent": { "$ref": "#/$defs/Id" },
        "provider": { "enum": ["aws", "azure", "gcp", "generic"] },
        "properties": { "type": "object" }
      }
    },
    "Policy": {
      "type": "object",
      "required": ["id", "kind", "statement", "enforce"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "kind": { "type": "string", "pattern": "^(security|reliability|performance|cost|operations|compliance)\\." },
        "statement": { "type": "string" },
        "appliesTo": { "type": "object" },
        "params": { "type": "object" },
        "enforce": { "enum": ["error", "warn", "info"] }
      }
    },
    "Requirement": {
      "type": "object",
      "required": ["id", "kind", "statement"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "kind": { "enum": ["availability", "scalability", "latency", "security", "compliance", "budget", "rpo_rto", "other"] },
        "statement": { "type": "string" },
        "quantity": { "type": "object" },
        "source": { "enum": ["user", "inferred"], "default": "user" }
      }
    },
    "Deployment": {
      "type": "object",
      "required": ["id", "environment"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "environment": { "type": "string" },
        "overrides": { "type": "array" }
      }
    },
    "Annotation": {
      "type": "object",
      "required": ["target", "kind", "body"],
      "properties": {
        "target": { "type": "string" },
        "kind": { "enum": ["note", "adr", "review", "todo", "link"] },
        "body": { "type": "string" }
      }
    }
  }
}
```

## Validation Pipeline (three passes)

1. **Structural** — JSON Schema above: shape, IDs, references resolve, no cycles in groups.
2. **Catalog** — `properties` validated against the bound service's property schema from
   the Catalog Service (e.g. `aws.aurora_postgresql` requires valid `instanceClass`);
   abstract-only components validated against capability schema.
3. **Semantic** — Validation Engine rules + the model's own `policies[]` (policies compile
   to the same rule IR — CEL over flattened model + Cypher for structural checks).

## The Abstract Type Taxonomy (top two levels)

```
compute.{vm, container.{orchestrator, instance, registry}, serverless.{function, app}}
network.{cdn, dns, loadbalancer.{l4, l7}, gateway.{api, nat, vpn, transit}, firewall.{waf, network}, link.{peering, direct}}
database.{relational, document, keyvalue, graph, timeseries, cache, search, warehouse}
storage.{object, block, file, archive}
messaging.{queue, topic, stream, eventbus}
integration.{workflow, etl, api_management}
security.{identity, secrets, keys, certificate}
observability.{metrics, logs, traces, alerting}
ml.{training, inference, embedding}
edge.{iot, mobile}
```

Each leaf has a **capability schema** (provider-neutral properties: e.g. every
`database.relational` has `engine`, `ha`, `encryption`, `backup`) — the basis for
multi-cloud translation: translation = re-binding components to equivalent services while
preserving capability properties, flagging fidelity gaps.

## ID Stability & Diff Semantics

- Component/connection IDs are **author-assigned and stable across commits** — they are
  the diff anchor. Renames change `name`, never `id`.
- AI agents must reuse existing IDs when modifying models (enforced by the orchestrator:
  diff-aware prompting + post-check that unchanged components keep IDs).
- `ModelDiff` algorithm: match by ID → classify added/removed; matched components →
  deep-diff properties → `ComponentModified(path, before, after)`. Connections matched by
  ID, fallback (from, to, kind) for imports.

## What CAML Deliberately Is Not

- **Not an IaC language.** No provisioning order, no state, no expressions/loops. IaC is
  generated *from* it; level of abstraction stays architectural.
- **Not a drawing format.** Layout/styling live in the commit's `layout` sidecar, excluded
  from hashing; exports to Draw.io/SVG are projections.
- **Not provider-complete.** The catalog curates the ~150 services/provider that appear in
  real architectures; long-tail resources imported via discovery become
  `generic.unmodeled` components with raw properties preserved — visible, diffable, not
  yet first-class.
