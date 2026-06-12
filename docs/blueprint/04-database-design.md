# 04 — Database Design

## Polyglot Persistence — Why Four Stores

| Store | Technology | Role | Why this and not something else |
|---|---|---|---|
| System of record | **PostgreSQL 16** (Aurora) | Tenancy, users, architectures, commits, reports, billing | ACID for the write path; JSONB stores CAML bodies natively; RLS gives a second tenant-isolation wall; one boring database the whole team knows. Rejected: per-service NoSQL — joins across tenancy/RBAC/commits are constant. |
| Graph | **Neo4j** (or Apache AGE inside Postgres at MVP) | Architecture component graphs + cloud knowledge graph | Validation needs path/reachability queries ("is any DB reachable from the internet?"), SPOF = articulation points, blast-radius = k-hop traversal. Recursive CTEs in Postgres handle depth-3; they fall over on pattern matching across 100k-node tenant graphs. AI grounding queries (doc 07) are native Cypher. |
| Vector | **pgvector** (→ dedicated Qdrant if recall/scale demands) | Embeddings: patterns, docs corpus, catalog, tenant architectures | RAG retrieval. Start in Postgres — one less system, transactional with source rows; HNSW indexes fine to ~50M vectors. Rejected as v1: Pinecone (vendor cost, data egress for sensitive tenant models). |
| Cache/RT | **Redis** (Elasticache, cluster mode) | Head-model cache, authz decisions, presence, rate limits, queues, Yjs fanout | Sub-ms reads for canvas loads and authz; pub/sub for collab fanout; streams for low-latency AI job dispatch. |
| Blobs | **S3** | Exports, IaC bundles, large model bodies, discovery snapshots | Immutable artifacts, lifecycle policies, presigned downloads. |
| Analytics | **ClickHouse** (Phase 3+) | Audit trail, usage analytics, AI telemetry | Append-heavy, 7-year retention, fast aggregation; keeps Postgres lean. |

## PostgreSQL Schema (core excerpts)

Conventions: every tenant-scoped table carries `tenant_id` (RLS-enforced), UUIDv7 PKs
(time-ordered → index locality), `created_at/updated_at`, soft-delete only where
user-recoverable.

```sql
-- ============ TENANCY & IDENTITY ============
CREATE TABLE tenants (
  id            UUID PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',     -- free|pro|team|enterprise
  sso_config    JSONB,                            -- WorkOS connection ref, domains
  security_policy JSONB NOT NULL DEFAULT '{}',    -- ip_allowlist, session_ttl, mfa_required
  cell_id       SMALLINT NOT NULL DEFAULT 1,      -- sharding cell (doc 11)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active|suspended|deactivated
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  UNIQUE (tenant_id, name)
);

CREATE TABLE role_assignments (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  principal_type TEXT NOT NULL,     -- user|service_account|group
  principal_id   UUID NOT NULL,
  role        TEXT NOT NULL,        -- owner|admin|architect|editor|reviewer|viewer
  scope_type  TEXT NOT NULL,        -- tenant|workspace|architecture
  scope_id    UUID NOT NULL,
  UNIQUE (principal_type, principal_id, scope_type, scope_id)
);
CREATE INDEX ON role_assignments (tenant_id, principal_id);

-- ============ ARCHITECTURE & VERSIONING (the heart) ============
CREATE TABLE architectures (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  description  TEXT,
  lifecycle    TEXT NOT NULL DEFAULT 'draft',     -- draft|active|archived
  default_branch TEXT NOT NULL DEFAULT 'main',
  catalog_version TEXT NOT NULL,                  -- pinned knowledge version
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE model_commits (
  hash            CHAR(64) NOT NULL,              -- sha256 of canonical CAML
  architecture_id UUID NOT NULL REFERENCES architectures(id),
  tenant_id       UUID NOT NULL,
  parent_hashes   CHAR(64)[] NOT NULL DEFAULT '{}',  -- DAG; 2 parents = merge
  origin          TEXT NOT NULL,        -- manual|ai_generation|ai_translation|discovery|iac_import|merge
  message         TEXT NOT NULL,
  rationale       JSONB,                -- AI DesignRationale / assumptions
  model           JSONB,                -- CAML body; NULL if spilled to S3
  model_blob_ref  TEXT,                 -- s3://... when model > 1MB
  model_size_bytes INT NOT NULL,
  layout          JSONB,                -- positions/sizes; excluded from hash
  stats           JSONB NOT NULL,       -- {components: n, connections: n, providers: [...]}
  author_id       UUID,                 -- NULL for system origins
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (architecture_id, hash)
);
CREATE INDEX ON model_commits (architecture_id, created_at DESC);

CREATE TABLE branches (
  architecture_id UUID NOT NULL,
  name            TEXT NOT NULL,
  tenant_id       UUID NOT NULL,
  head_hash       CHAR(64) NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'design',  -- design|observed (digital twin lineage)
  protected       BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (architecture_id, name)
  -- head moves via UPDATE ... WHERE head_hash = :expected (optimistic concurrency)
);

CREATE TABLE merge_requests (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  architecture_id UUID NOT NULL,
  source_branch   TEXT NOT NULL,
  target_branch   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open|approved|merged|closed|conflicted
  required_approvals SMALLINT NOT NULL DEFAULT 1,
  merged_commit   CHAR(64),
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ VALIDATION ============
CREATE TABLE validation_reports (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  commit_hash     CHAR(64) NOT NULL,
  ruleset_version TEXT NOT NULL,
  packs           TEXT[] NOT NULL,                 -- ['baseline','cis-aws-1.5','pci-4.0']
  summary         JSONB NOT NULL,                  -- {critical:0, high:2, medium:5, ...}
  findings        JSONB NOT NULL,                  -- [Finding]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commit_hash, ruleset_version, packs)
);

CREATE TABLE waivers (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  architecture_id UUID NOT NULL,
  rule_id         TEXT NOT NULL,
  component_ref   TEXT,                            -- NULL = whole architecture
  justification   TEXT NOT NULL,
  approved_by     UUID NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);

-- ============ DIGITAL TWIN ============
CREATE TABLE cloud_connections (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  workspace_id UUID NOT NULL,
  provider     TEXT NOT NULL,            -- aws|azure|gcp
  external_ref TEXT NOT NULL,            -- account id / subscription id / project id
  auth_config  JSONB NOT NULL,           -- role ARN + external id / SP ids / WIF — NO SECRETS
  scopes       TEXT[] NOT NULL,          -- regions, resource filters
  status       TEXT NOT NULL DEFAULT 'pending_verification',
  last_scan_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider, external_ref)
);

CREATE TABLE discovery_snapshots (
  id             UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  connection_id  UUID NOT NULL REFERENCES cloud_connections(id),
  observed_commit CHAR(64),              -- resulting commit on 'observed' branch
  resource_count INT NOT NULL,
  raw_blob_ref   TEXT NOT NULL,          -- s3://... normalized inventory
  started_at     TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ
);

CREATE TABLE drift_reports (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  architecture_id UUID NOT NULL,
  designed_commit CHAR(64) NOT NULL,
  observed_commit CHAR(64) NOT NULL,
  items           JSONB NOT NULL,        -- [DriftItem{kind, severity, component_ref, detail}]
  summary         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ AI ============
CREATE TABLE copilot_sessions (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  architecture_id UUID,
  messages    JSONB NOT NULL DEFAULT '[]',   -- rolling window; full trace in S3
  token_usage JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_jobs (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  session_id  UUID,
  kind        TEXT NOT NULL,           -- generate|review|translate|document|chat_action
  status      TEXT NOT NULL DEFAULT 'queued',
  input       JSONB NOT NULL,
  result_refs JSONB,                   -- {branch, commit_hash, artifact_ids}
  trace_ref   TEXT,                    -- s3://... full agent trace
  tokens_in   INT, tokens_out INT, cost_usd NUMERIC(10,4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============ ARTIFACTS, COST, COLLAB, AUDIT ============
CREATE TABLE artifacts (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  commit_hash  CHAR(64) NOT NULL,
  kind         TEXT NOT NULL,          -- terraform|cdk|cfn|pulumi|hld|lld|adr|runbook|png|svg|pdf
  generator_version TEXT NOT NULL,
  blob_ref     TEXT NOT NULL,
  meta         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commit_hash, kind, generator_version)
);

CREATE TABLE cost_estimates (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  commit_hash  CHAR(64) NOT NULL,
  pricing_date DATE NOT NULL,
  usage_profile JSONB NOT NULL,
  monthly_usd  NUMERIC(14,2) NOT NULL,
  line_items   JSONB NOT NULL,         -- per-component breakdown
  optimizations JSONB NOT NULL DEFAULT '[]',
  UNIQUE (commit_hash, pricing_date, usage_profile)
);

CREATE TABLE comment_threads (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  architecture_id UUID NOT NULL,
  anchor       JSONB NOT NULL,         -- {type: component|connection|commit|finding, ref}
  resolved     BOOLEAN NOT NULL DEFAULT false,
  comments     JSONB NOT NULL          -- [{author, body, at}] (small, bounded)
);

CREATE TABLE audit_events (              -- mirrored to ClickHouse; PG keeps 90 days
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  actor       JSONB NOT NULL,           -- {type, id, ip, user_agent}
  action      TEXT NOT NULL,            -- e.g. architecture.merge, waiver.create
  resource    JSONB NOT NULL,
  detail      JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (at);
```

**Row-Level Security** (defense in depth — app layer filters first, RLS catches bugs):

```sql
ALTER TABLE architectures ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON architectures
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- identical policy on every tenant-scoped table; set via SET LOCAL per transaction
```

## Neo4j Graph Model

Two graphs, one database (separate labels):

**1. Knowledge Graph (global, curated):**

```cypher
// Node labels
(:AbstractType {path: 'compute.container.orchestrator', name, capabilities})
(:CloudService {key: 'aws.eks', provider: 'aws', name, tier, status})
(:Pattern {key: 'web-3tier-ha', name, caml_ref, tags})
(:ComplianceControl {framework: 'pci-4.0', control: '1.3.1'})
(:Rule {id: 'SEC-012', severity})

// Relationships
(:CloudService)-[:IMPLEMENTS]->(:AbstractType)
(:CloudService)-[:EQUIVALENT_TO {fidelity: 0.92, caveats}]->(:CloudService)
(:CloudService)-[:COMMONLY_CONNECTS_TO {protocol, purpose}]->(:CloudService)
(:Pattern)-[:USES]->(:AbstractType)
(:Rule)-[:EVIDENCES]->(:ComplianceControl)
(:Rule)-[:APPLIES_TO]->(:AbstractType)
```

**2. Architecture Instance Graph (per tenant commit, projected on write):**

```cypher
(:Component {tenant_id, commit_hash, ref: 'web-asg', service_key: 'aws.ec2_asg', props_hash})
  -[:CONNECTS_TO {protocol: 'https', port: 443}]->(:Component)
  -[:MEMBER_OF]->(:Group {kind: 'subnet'|'vpc'|'region'|'zone'})
(:Component)-[:IS_A]->(:CloudService)   // bridge into knowledge graph
```

Example validation query — *"databases reachable from an internet-facing entry point"*:

```cypher
MATCH (entry:Component {commit_hash: $hash})-[:IS_A]->(:CloudService {internet_facing: true}),
      path = (entry)-[:CONNECTS_TO*1..6]->(db:Component)-[:IS_A]->(:CloudService)-[:IMPLEMENTS]->
             (:AbstractType {path: 'database.relational'})
WHERE NOT any(c IN nodes(path) WHERE c.service_key IN $waf_or_firewall_keys)
RETURN entry.ref, db.ref, [n IN nodes(path) | n.ref] AS exposure_path
```

Retention: only branch heads + tagged commits stay projected in Neo4j; historical commits
re-projected on demand from Postgres.

## Vector Store (pgvector)

```sql
CREATE TABLE embeddings (
  id         UUID PRIMARY KEY,
  tenant_id  UUID,                       -- NULL = global corpus
  kind       TEXT NOT NULL,              -- pattern|catalog_doc|best_practice|tenant_architecture|adr
  source_ref TEXT NOT NULL,              -- pattern key / commit hash / doc id
  chunk_text TEXT NOT NULL,
  embedding  VECTOR(1024) NOT NULL,      -- voyage-3-large or equivalent
  meta       JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
-- retrieval ALWAYS filters: WHERE tenant_id IS NULL OR tenant_id = $tenant
-- (global knowledge + own tenant only — never cross-tenant leakage)
```

## Redis Keyspace Plan

| Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `model:head:{arch}:{branch}` | string (JSON, compressed) | until commit | Hot model for canvas load |
| `authz:{principal}:{scope}` | hash | 60s | Cerbos decision cache |
| `presence:{arch}` | hash + pubsub | 30s heartbeat | Cursors, who's online |
| `ratelimit:{tenant}:{route}` | sliding window | 1m | Per-tenant limits |
| `aijobs` | stream + consumer groups | — | Low-latency agent dispatch |
| `tokenbudget:{tenant}:{month}` | counter | month | AI spend enforcement |

## Capacity & Growth Model

| Assumption | Value | Implication |
|---|---|---|
| Avg CAML model | 40KB JSONB (200 components) | 10M architectures × 30 commits ≈ 12TB → S3 spill for bodies >1MB, partition `model_commits` by architecture hash range at ~2TB |
| Commits/day at scale | ~5M (collab micro-commits) | Squash-on-merge keeps lineage sane; micro-commits pruned after 30 days |
| Neo4j projected nodes | heads only: ~10M arch × 200 = 2B → too big for one instance | Per-cell Neo4j instances (tenant-sharded with Postgres cells, doc 11) |
| Embeddings | ~50M chunks | pgvector OK; revisit Qdrant past that |

**Migration discipline:** Flyway/Atlas migrations, expand-and-contract only (no breaking
DDL), every schema change reversible, CAML schema versioned independently with in-model
`camlVersion` and on-read upgraders.
