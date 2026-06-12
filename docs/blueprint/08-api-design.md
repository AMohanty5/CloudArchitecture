# 08 — API Design

## Protocol Strategy

| Protocol | Used for | Why |
|---|---|---|
| **REST** (`/api/v1`) | Commands & artifacts: create/commit/merge/generate/export; CLI & third-party integrations | Predictable, cacheable, idempotency-friendly, easiest for customers' CI |
| **GraphQL** (`/graphql`) | Reads for the web app: dashboards, architecture browser, MR views | One round trip for deeply nested views (architecture → branches → MRs → reports → comments); federation composes service subgraphs |
| **WebSocket** (`/ws`) | Collaboration (Yjs), AI job streaming, live notifications | Bidirectional, low latency |
| Webhooks (outbound) | Customer integrations: drift alerts, MR events, validation results | Slack/Teams/Jira/custom; HMAC-signed |

All protocols share: JWT bearer auth (or `X-Api-Key` for service accounts), tenant
resolution at gateway, per-tenant rate limits (`X-RateLimit-*` headers), request IDs,
RFC 9457 problem+json errors.

## REST API (representative spec)

```yaml
openapi: 3.1.0
info: { title: Cloud Architect Copilot API, version: "1" }
# ───────── Architectures & versioning ─────────
paths:
  /api/v1/architectures:
    post:
      summary: Create architecture
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [workspaceId, name]
              properties:
                workspaceId: { type: string, format: uuid }
                name: { type: string }
                from: { type: object, description: "optional: { patternKey } | { templateId } | { camlDocument }" }
      responses:
        "201": { description: "Architecture + default branch + initial commit" }
    get:
      summary: List architectures (filter by workspace, tag, lifecycle; cursor pagination)

  /api/v1/architectures/{archId}/branches/{branch}/model:
    get:
      summary: Resolve branch head → full CAML
      description: ETag = commit hash; supports If-None-Match for cheap polling.
      responses:
        "200":
          headers: { ETag: { schema: { type: string } } }
          content:
            application/caml+json: { schema: { $ref: "caml-1.0.schema.json" } }

  /api/v1/architectures/{archId}/branches/{branch}/commits:
    post:
      summary: Append a commit
      parameters:
        - { name: Idempotency-Key, in: header, schema: { type: string } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [message, expectedParent]
              properties:
                message: { type: string }
                expectedParent: { type: string, description: "optimistic lock; 409 on mismatch" }
                model: { description: "full CAML document", type: object }
                patch: { description: "OR RFC-6902 patch against parent", type: array }
                layout: { type: object }
      responses:
        "201": { description: "{ hash, stats, validationJobId }" }
        "409": { description: "Parent moved — client must rebase" }
        "422": { description: "CAML schema/catalog validation errors (problem+json with per-path details)" }

  /api/v1/architectures/{archId}/diff:
    get:
      summary: Typed ModelDiff between two refs
      parameters:
        - { name: from, in: query, required: true, description: "commit hash | branch | tag" }
        - { name: to, in: query, required: true }
      responses:
        "200": { description: "{ componentsAdded[], componentsRemoved[], componentsModified[{id, changes[{path, before, after}]}], connections..., policies..., costDelta? }" }

  /api/v1/architectures/{archId}/merge-requests:
    post: { summary: "Open MR { sourceBranch, targetBranch, title }" }
  /api/v1/merge-requests/{mrId}/merge:
    post:
      summary: Merge (requires approvals per branch protection)
      responses:
        "200": { description: "{ mergedCommit }" }
        "409": { description: "{ conflicts: [{elementId, kind, ours, theirs}] }" }

# ───────── AI ─────────
  /api/v1/ai/generate:
    post:
      summary: Natural language → architecture proposal
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [prompt]
              properties:
                prompt: { type: string, example: "Design a highly available multi-region e-commerce platform on AWS serving 50 million users" }
                architectureId: { type: string, description: "omit → create new" }
                baseBranch: { type: string, default: main }
                constraints: { type: object, description: "{ providers:[aws], budgetMonthlyUsd, compliancePacks:[pci-4.0], regionAllowList }" }
                interactive: { type: boolean, default: true, description: "allow clarifying questions" }
      responses:
        "202": { description: "{ jobId, streamUrl: wss://.../ws/ai/{jobId} }" }

  /api/v1/ai/review:
    post: { summary: "Principal-architect review of a commit → { jobId }" }
  /api/v1/ai/translate:
    post: { summary: "{ commit, targetProvider, strategy: like-for-like|idiomatic } → { jobId }" }
  /api/v1/ai/jobs/{jobId}:
    get: { summary: "{ status, stages[], resultRefs: { branch, commitHash, reportId }, usage }" }

# ───────── Validation / Cost / IaC / Docs ─────────
  /api/v1/validate:
    post:
      summary: Validate a commit
      requestBody:
        content:
          application/json:
            schema: { type: object, properties: { commitHash: {type: string}, packs: { type: array, items: {enum: [baseline, cis-aws, cis-azure, cis-gcp, nist-800-53, pci-4.0, hipaa, soc2]} } } }
      responses:
        "200": { description: "ValidationReport { summary, findings[{ruleId, severity, componentRefs, message, remediation: {text, camlPatch?}}] }" }

  /api/v1/cost/estimate:
    post: { summary: "{ commitHash, usageProfile? } → { monthlyUsd, yearlyUsd, lineItems[], assumptions[], optimizations[] }" }

  /api/v1/iac/generate:
    post:
      summary: Generate IaC bundle
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [commitHash, target]
              properties:
                target: { enum: [terraform, cloudformation, cdk-typescript, cdk-python, pulumi-typescript] }
                options: { type: object, description: "{ moduleLayout: flat|per-domain, stateBackend, deliverTo: download|github-pr }" }
      responses:
        "202": { description: "{ artifactId } → poll /artifacts/{id} → presigned URL or PR link" }

  /api/v1/docs/generate:
    post: { summary: "{ commitHash, kind: hld|lld|adr|security-review|runbook|dr-guide, format: md|docx|pdf|confluence } → { artifactId }" }

# ───────── Cloud connections & twin ─────────
  /api/v1/connections:
    post:
      summary: Register cloud connection (returns provider-specific onboarding payload — e.g. CloudFormation quick-link for the read-only role; doc 09)
  /api/v1/connections/{id}/scan:
    post: { summary: "Trigger discovery → { snapshotId }" }
  /api/v1/architectures/{archId}/drift:
    get: { summary: "Latest DriftReport { items[{kind: missing|unexpected|modified, severity, componentRef, cloudResourceId, detail}], summary }" }
```

## GraphQL Schema (web-app read layer, excerpt)

```graphql
type Query {
  workspace(id: ID!): Workspace
  architecture(id: ID!): Architecture
  searchArchitectures(query: String!, first: Int = 20, after: String): ArchitectureConnection!
  catalogServices(provider: Provider, search: String): [CatalogService!]!
  me: User!
}

type Architecture {
  id: ID!
  name: String!
  lifecycle: Lifecycle!
  defaultBranch: String!
  branches: [Branch!]!
  branch(name: String!): Branch
  commit(hash: String!): Commit
  mergeRequests(status: MRStatus): [MergeRequest!]!
  driftStatus: DriftStatus            # IN_SYNC | DRIFTED(count) | NOT_CONNECTED
  thumbnailUrl: String!
}

type Branch {
  name: String!
  head: Commit!
  protected: Boolean!
}

type Commit {
  hash: String!
  message: String!
  origin: CommitOrigin!               # MANUAL | AI_GENERATION | DISCOVERY | ...
  author: Actor
  createdAt: DateTime!
  stats: ModelStats!                  # componentCount, connectionCount, providers
  validation(packs: [PackKey!]): ValidationReport
  costEstimate: CostEstimate
  artifacts(kind: ArtifactKind): [Artifact!]!
  rationale: [DesignRationale!]!
  diff(against: String!): ModelDiff!
}

type ValidationReport {
  summary: FindingSummary!            # counts by severity
  findings(severity: Severity, category: RuleCategory): [Finding!]!
}

type Finding {
  rule: Rule!
  severity: Severity!
  componentRefs: [String!]!
  message: String!
  remediation: Remediation            # text + optional one-click camlPatch
  waiver: Waiver
}

type MergeRequest {
  id: ID!
  title: String!
  status: MRStatus!
  diff: ModelDiff!
  costDelta: CostDelta                # "+$1,240/mo" on every MR
  validationDelta: ValidationDelta    # "+1 high finding, -3 medium"
  reviews: [Review!]!
  commentThreads: [CommentThread!]!
}
```

One query renders the entire MR review screen — diff, cost delta, validation delta,
reviews, comments — the page that REST would need 6 round trips for.

## WebSocket Channels

| Channel | Protocol | Payloads |
|---|---|---|
| `/ws/collab/{archId}/{branch}` | Yjs sync v2 + awareness | CRDT updates, presence (cursors, selections, viewports) |
| `/ws/ai/{jobId}` | JSON events | `stage` (planning→generating→validating), `partial_model` (streamed CAML sections → canvas draws progressively), `assumption` (inferred requirement for inline confirm), `question` (clarification), `completed`, `failed` |
| `/ws/notifications` | JSON events | MR events, validation completed, drift detected, comment mentions |

Example AI stream sequence:

```json
{"type":"stage","stage":"planning","detail":"Selected patterns: web-multi-region-active-passive, commerce-core"}
{"type":"assumption","id":"a1","text":"Assuming PCI DSS scope since payments are processed","confidence":0.86}
{"type":"partial_model","section":"groups","caml":{"groups":[...]}}
{"type":"partial_model","section":"components","caml":{"components":[...]}}
{"type":"stage","stage":"validating","detail":"2 high findings, attempting repair"}
{"type":"completed","branch":"ai/gen-7f3a","commitHash":"ab12...","mergeRequestId":"mr_991"}
```

## Versioning, Limits, Compatibility

- REST: URL major version (`/api/v1`); additive changes only within a version; 12-month
  deprecation windows with `Sunset` headers. GraphQL: additive evolution + `@deprecated`.
- Rate limits (per tenant, headers on every response): reads 1000/min, writes 200/min,
  AI jobs 20 concurrent-equivalent units, exports 60/hour. Burst via token bucket.
- Pagination: cursor-based everywhere (`first/after`), max page 200.
- Bulk: `POST /api/v1/batch` for CLI sync scenarios (array of operations, per-item status).
- SDKs generated from OpenAPI/GraphQL schemas: TypeScript and Python at GA, Go for CI users.
