/* AUTO-GENERATED from schemas/caml-1.0.schema.json — do not edit by hand.
 * Regenerate with: pnpm --filter @cac/caml gen
 */

/**
 * Author-assigned, stable across commits. The diff anchor. Renames change 'name', never 'id'.
 */
export type Id = string;
/**
 * Taxonomy path. Leaf values enumerated below; intermediate paths (e.g. 'compute.container') are valid for early-stage/abstract designs and are refined later.
 */
export type AbstractType =
  | "compute"
  | "compute.vm"
  | "compute.vm.autoscaling_group"
  | "compute.baremetal"
  | "compute.container"
  | "compute.container.orchestrator"
  | "compute.container.orchestrator.service"
  | "compute.container.instance"
  | "compute.container.registry"
  | "compute.serverless"
  | "compute.serverless.function"
  | "compute.serverless.app"
  | "compute.batch"
  | "network"
  | "network.cdn"
  | "network.dns"
  | "network.dns.zone"
  | "network.dns.record_policy"
  | "network.loadbalancer"
  | "network.loadbalancer.l4"
  | "network.loadbalancer.l7"
  | "network.loadbalancer.global"
  | "network.gateway"
  | "network.gateway.api"
  | "network.gateway.nat"
  | "network.gateway.internet"
  | "network.gateway.vpn"
  | "network.gateway.transit"
  | "network.firewall"
  | "network.firewall.waf"
  | "network.firewall.network"
  | "network.firewall.ddos"
  | "network.link"
  | "network.link.peering"
  | "network.link.direct"
  | "network.endpoint.private"
  | "network.servicemesh"
  | "network.ip.static"
  | "database"
  | "database.relational"
  | "database.relational.serverless"
  | "database.document"
  | "database.keyvalue"
  | "database.widecolumn"
  | "database.graph"
  | "database.timeseries"
  | "database.cache"
  | "database.search"
  | "database.warehouse"
  | "database.ledger"
  | "database.vector"
  | "storage"
  | "storage.object"
  | "storage.block"
  | "storage.file"
  | "storage.archive"
  | "storage.transfer"
  | "storage.backup"
  | "messaging"
  | "messaging.queue"
  | "messaging.topic"
  | "messaging.stream"
  | "messaging.eventbus"
  | "messaging.broker.mqtt"
  | "messaging.broker.amqp"
  | "messaging.broker.kafka"
  | "integration"
  | "integration.workflow"
  | "integration.etl"
  | "integration.api_management"
  | "integration.appflow"
  | "integration.scheduler"
  | "security"
  | "security.identity"
  | "security.identity.idp"
  | "security.identity.federation"
  | "security.secrets"
  | "security.keys"
  | "security.certificate"
  | "security.scanner.vulnerability"
  | "security.scanner.posture"
  | "security.audit"
  | "security.hsm"
  | "observability"
  | "observability.metrics"
  | "observability.logs"
  | "observability.traces"
  | "observability.alerting"
  | "observability.dashboard"
  | "observability.synthetics"
  | "analytics"
  | "analytics.query"
  | "analytics.bi"
  | "analytics.catalog"
  | "analytics.processing.spark"
  | "ml"
  | "ml.training"
  | "ml.inference"
  | "ml.embedding"
  | "ml.platform"
  | "ml.llm"
  | "edge"
  | "edge.iot.core"
  | "edge.iot.gateway"
  | "edge.mobile.backend"
  | "edge.compute"
  | "devtools"
  | "devtools.cicd"
  | "devtools.repo"
  | "devtools.artifact"
  | "devtools.iac"
  | "user"
  | "user.browser"
  | "user.mobile_app"
  | "user.internal"
  | "external"
  | "external.saas"
  | "external.partner_system"
  | "external.onprem"
  | "generic"
  | "generic.unmodeled"
  | "generic.custom";
export type Provider = "aws" | "azure" | "gcp" | "generic";

/**
 * Normative schema for CAML 1.0 architecture documents. Pass 1 of 3 in the validation pipeline: structural validation. Pass 2 (catalog property validation) and pass 3 (semantic rules) are applied by the Validation Engine. Canonicalization for content hashing: UTF-8, sorted object keys, arrays sorted by 'id' where elements carry one, no insignificant whitespace, 'layout' and 'annotations' excluded.
 */
export interface CamlDocument {
  /**
   * Schema version this document conforms to. On-read upgraders migrate older versions forward.
   */
  camlVersion: "1.0";
  /**
   * Stable architecture identifier, assigned at creation, never changes.
   */
  id: string;
  name: string;
  description?: string;
  metadata?: Metadata;
  /**
   * Functional and non-functional requirements the design must satisfy. Both user-stated and AI-inferred (source flag distinguishes).
   */
  requirements?: Requirement[];
  /**
   * @maxItems 5000
   */
  components: Component[];
  /**
   * @maxItems 20000
   */
  connections?: Connection[];
  /**
   * @maxItems 1000
   */
  groups?: Group[];
  policies?: Policy[];
  deployments?: Deployment[];
  /**
   * Non-semantic notes. Excluded from content hash.
   */
  annotations?: Annotation[];
}
export interface Metadata {
  /**
   * Team or person accountable
   */
  owner?: string;
  /**
   * Catalog release the model was authored against, e.g. '2026.06.1'
   */
  catalogVersion?: string;
  /**
   * @maxItems 50
   */
  tags?: string[];
  domain?: string;
  lifecycle?: "concept" | "design" | "approved" | "deployed" | "deprecated";
  links?: {
    rel: "repo" | "ticket" | "doc" | "dashboard" | "runbook" | "other";
    url: string;
    title?: string;
    [k: string]: unknown;
  }[];
  dataClassification?: "public" | "internal" | "confidential" | "restricted";
  /**
   * Tenant-defined fields; validated against tenant metadata schema if one is registered
   */
  custom?: {
    [k: string]: unknown;
  };
}
export interface Requirement {
  id: Id;
  kind:
    | "availability"
    | "scalability"
    | "latency"
    | "throughput"
    | "durability"
    | "security"
    | "compliance"
    | "budget"
    | "rpo_rto"
    | "data_residency"
    | "operability"
    | "other";
  statement: string;
  /**
   * Machine-checkable parameters, keys by kind. Examples: {slo: 0.9995}, {peak_rps: 30000}, {p99_ms: 200}, {rpo_minutes: 5, rto_minutes: 60}, {monthly_usd_max: 25000}, {regions_allowed: ['eu-*']}
   */
  quantity?: {
    [k: string]: number | string | boolean | unknown[];
  };
  source?: "user" | "inferred";
  /**
   * Set when source=inferred
   */
  confidence?: number;
  priority?: "must" | "should" | "could";
}
export interface Component {
  id: Id;
  type: AbstractType;
  binding?: Binding;
  name: string;
  description?: string;
  group?: Id;
  /**
   * Identical replicas rendered as a stacked node; distinct configs require distinct components
   */
  count?: number;
  /**
   * Pass-2 schema = capability schema of 'type' merged with service schema of 'binding.service'. Unknown keys are pass-2 errors for bound components, warnings for abstract ones.
   */
  properties?: {
    [k: string]: unknown;
  };
  scaling?: {
    mode?: "none" | "horizontal" | "vertical" | "serverless";
    min?: number;
    max?: number;
    metric?: "cpu" | "memory" | "rps" | "queue_depth" | "schedule" | "custom";
    target?: number;
  };
  operations?: {
    backup?: {
      enabled?: boolean;
      retentionDays?: number;
      pitr?: boolean;
      crossRegion?: boolean;
      [k: string]: unknown;
    };
    monitoring?: {
      metrics?: boolean;
      logs?: boolean;
      traces?: boolean;
      /**
       * Alert intents, e.g. 'error_rate>1%', resolved to provider alarms at IaC generation
       */
      alerts?: string[];
      [k: string]: unknown;
    };
    patching?: "managed" | "automated" | "manual";
  };
  /**
   * Highest classification of data this component stores/processes; drives exposure rules
   */
  dataClassification?: "public" | "internal" | "confidential" | "restricted";
  /**
   * Business criticality; weights validation severity and DR recommendations
   */
  criticality?: "critical" | "high" | "medium" | "low";
  /**
   * Present when origin is discovery or IaC import
   */
  importRef?: {
    /**
     * ARN / Azure resource ID / GCP self-link
     */
    cloudResourceId?: string;
    sourceFormat?: "discovery" | "terraform" | "cloudformation" | "drawio" | "vsdx";
    confidence?: number;
    /**
     * Preserved unmapped properties for generic.unmodeled
     */
    raw?: {
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
}
export interface Binding {
  provider: Provider;
  /**
   * Catalog key. Existence and property conformance checked in validation pass 2.
   */
  service: string;
  /**
   * Optional pin, e.g. engine major version where the catalog versions schemas
   */
  serviceVersion?: string;
}
export interface Connection {
  id: Id;
  /**
   * Author-assigned, stable across commits. The diff anchor. Renames change 'name', never 'id'.
   */
  from: string;
  to: Id;
  /**
   * traffic=request/response; data=read/write to a store; async=queue/topic/event; dependency=non-network logical dependency; replication=data sync between stores/regions; peering=network-level link; identity=authn/z relationship; observability=telemetry flow
   */
  kind: "traffic" | "data" | "async" | "dependency" | "replication" | "peering" | "identity" | "observability";
  direction?: "uni" | "bi";
  name?: string;
  properties?: {
    protocol?:
      | "https"
      | "http"
      | "tcp"
      | "udp"
      | "grpc"
      | "websocket"
      | "postgres"
      | "mysql"
      | "redis"
      | "mongodb"
      | "amqp"
      | "kafka"
      | "mqtt"
      | "smb"
      | "nfs"
      | "dns"
      | "icmp"
      | "custom";
    port?: number;
    encrypted?: boolean;
    mtls?: boolean;
    authentication?: "none" | "iam" | "oauth" | "api_key" | "mtls_cert" | "password" | "managed_identity";
    pattern?: "request_response" | "publish" | "subscribe" | "push" | "pull" | "batch" | "stream";
    bandwidthMbps?: number;
    expectedRps?: number;
    /**
     * true = derived from flow logs/config by discovery, not designed
     */
    observed?: boolean;
  };
}
export interface Group {
  id: Id;
  kind:
    | "region"
    | "zone"
    | "network"
    | "subnet"
    | "tier"
    | "domain"
    | "account"
    | "cluster"
    | "namespace"
    | "resource_group"
    | "project"
    | "custom";
  name: string;
  /**
   * Author-assigned, stable across commits. The diff anchor. Renames change 'name', never 'id'.
   */
  parent?: string;
  provider?: Provider;
  /**
   * Kind-dependent: network/subnet take cidr, zone, public; region takes the provider region code; account/project take the external identifier
   */
  properties?: {
    [k: string]: unknown;
  };
}
export interface Policy {
  id: Id;
  /**
   * Well-known kinds map to built-in parameterized rules (security.encryption, security.exposure, security.least_privilege, reliability.redundancy, reliability.backup, reliability.multi_region, performance.capacity, cost.budget, cost.tagging, operations.monitoring, compliance.residency). Unknown kinds are tenant-custom and require a registered rule.
   */
  kind: string;
  /**
   * Human-readable intent; shown in reports
   */
  statement: string;
  /**
   * Empty/omitted = whole architecture
   */
  appliesTo?: {
    typePrefix?: string;
    componentIds?: Id[];
    groupIds?: Id[];
    tags?: string[];
    dataClassificationAtLeast?: "internal" | "confidential" | "restricted";
  };
  /**
   * Rule parameters, e.g. {minZones: 2}, {kms: 'cmk'}, {monthlyUsdMax: 25000}
   */
  params?: {
    [k: string]: unknown;
  };
  enforce: "error" | "warn" | "info";
}
export interface Deployment {
  id: Id;
  environment: string;
  description?: string;
  bindings?: {
    /**
     * AWS account / Azure subscription / GCP project this environment deploys to
     */
    accountRef?: string;
    regionOverride?: string;
    /**
     * Token template, e.g. '{org}-{env}-{component}' — used by IaC generation and twin matching
     */
    namingConvention?: string;
  };
  overrides?: {
    target: Id;
    properties?: {
      [k: string]: unknown;
    };
    scaling?: {
      [k: string]: unknown;
    };
    /**
     * Component absent in this environment
     */
    disabled?: boolean;
    [k: string]: unknown;
  }[];
}
export interface Annotation {
  /**
   * Component/connection/group id, or 'document'
   */
  target: string;
  kind: "note" | "adr" | "review" | "todo" | "link" | "ai_rationale" | "translation_caveat";
  body: string;
  author?: string;
  at?: string;
}
