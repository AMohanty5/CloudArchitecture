# 14 — Catalog Seed: Phase 1 AWS Services + Cross-Cloud Equivalence Map

This is the authoritative scope list for the Phase 1 catalog (60 AWS services) and the
Phase 2 equivalence map. Each row is one "catalog unit of work" — the definition of done
per service is: **abstract-type mapping + property schema + icon + Terraform template +
CDK template + cost dimensions + 2 eval cases** (doc 12, invariant 1).

Fidelity legend: ● ≥0.9 drop-in · ◐ 0.7–0.89 minor redesign · ○ <0.7 idiom shift, agent
handles (doc 07).

## Networking & Content Delivery

| # | AWS (catalog key) | Abstract type | Azure equivalent | Fid | GCP equivalent | Fid |
|---|---|---|---|---|---|---|
| 1 | `aws.vpc` | group kind `network` | Virtual Network `azure.vnet` | ● | VPC Network `gcp.vpc` | ◐ (global vs regional) |
| 2 | `aws.subnet` | group kind `subnet` | Subnet `azure.subnet` | ● | Subnetwork `gcp.subnet` | ● |
| 3 | `aws.security_group` | network.firewall.network (attached) | NSG `azure.nsg` | ◐ (subnet-scoped vs ENI) | Firewall rules `gcp.firewall_rule` | ◐ |
| 4 | `aws.nacl` | network.firewall.network | NSG (merged) | ◐ | Firewall policies | ◐ |
| 5 | `aws.internet_gateway` | network.gateway.internet | implicit in VNet | ○ | implicit | ○ |
| 6 | `aws.nat_gateway` | network.gateway.nat | NAT Gateway `azure.nat_gateway` | ● | Cloud NAT `gcp.cloud_nat` | ● |
| 7 | `aws.route53` | network.dns | Azure DNS + Traffic Manager | ◐ | Cloud DNS `gcp.cloud_dns` | ◐ |
| 8 | `aws.cloudfront` | network.cdn | Front Door / CDN `azure.front_door` | ◐ | Cloud CDN `gcp.cloud_cdn` | ◐ |
| 9 | `aws.alb` | network.loadbalancer.l7 | Application Gateway `azure.app_gateway` | ◐ | Global ext. HTTP(S) LB `gcp.https_lb` | ◐ |
| 10 | `aws.nlb` | network.loadbalancer.l4 | Azure Load Balancer `azure.lb` | ● | Network LB `gcp.network_lb` | ● |
| 11 | `aws.api_gateway` | network.gateway.api | API Management `azure.apim` | ◐ | API Gateway / Apigee `gcp.api_gateway` | ◐ |
| 12 | `aws.waf` | network.firewall.waf | Azure WAF `azure.waf` | ● | Cloud Armor `gcp.cloud_armor` | ● |
| 13 | `aws.transit_gateway` | network.gateway.transit | Virtual WAN `azure.vwan` | ○ | NCC `gcp.ncc` | ○ |
| 14 | `aws.vpn_gateway` | network.gateway.vpn | VPN Gateway `azure.vpn_gateway` | ● | Cloud VPN `gcp.cloud_vpn` | ● |
| 15 | `aws.direct_connect` | network.link.direct | ExpressRoute `azure.expressroute` | ● | Interconnect `gcp.interconnect` | ● |
| 16 | `aws.vpc_peering` | network.link.peering | VNet Peering `azure.vnet_peering` | ● | VPC Peering `gcp.vpc_peering` | ● |
| 17 | `aws.privatelink` | network.endpoint.private | Private Link `azure.private_link` | ● | Private Service Connect `gcp.psc` | ● |
| 18 | `aws.global_accelerator` | network.loadbalancer.global | Front Door (merged) | ○ | Premium network tier (implicit) | ○ |

## Compute & Containers

| # | AWS | Abstract type | Azure | Fid | GCP | Fid |
|---|---|---|---|---|---|---|
| 19 | `aws.ec2` | compute.vm | Virtual Machines `azure.vm` | ● | Compute Engine `gcp.gce` | ● |
| 20 | `aws.ec2_asg` | compute.vm.autoscaling_group | VM Scale Sets `azure.vmss` | ● | Managed Instance Groups `gcp.mig` | ● |
| 21 | `aws.ecs` | compute.container.orchestrator | Container Apps `azure.container_apps` | ◐ | Cloud Run (svc-level) | ◐ |
| 22 | `aws.ecs_service` | compute.container.orchestrator.service | Container App `azure.container_app` | ◐ | Cloud Run service `gcp.cloud_run` | ◐ |
| 23 | `aws.fargate` | compute.container.instance (capacity mode) | Container Apps (consumption) | ◐ | Cloud Run | ◐ |
| 24 | `aws.eks` | compute.container.orchestrator | AKS `azure.aks` | ● | GKE `gcp.gke` | ● |
| 25 | `aws.eks_service` | compute.container.orchestrator.service | AKS workload | ● | GKE workload `gcp.gke_service` | ● |
| 26 | `aws.ecr` | compute.container.registry | ACR `azure.acr` | ● | Artifact Registry `gcp.artifact_registry` | ● |
| 27 | `aws.lambda` | compute.serverless.function | Functions `azure.functions` | ◐ (runtime/trigger model) | Cloud Functions `gcp.cloud_functions` | ◐ |
| 28 | `aws.app_runner` | compute.serverless.app | App Service `azure.app_service` | ◐ | Cloud Run | ● |
| 29 | `aws.batch` | compute.batch | Azure Batch `azure.batch` | ● | Cloud Batch `gcp.batch` | ● |

## Databases & Caching

| # | AWS | Abstract type | Azure | Fid | GCP | Fid |
|---|---|---|---|---|---|---|
| 30 | `aws.rds` (pg/mysql/etc.) | database.relational | Azure Database for PG/MySQL `azure.pg_flexible` | ● | Cloud SQL `gcp.cloud_sql` | ● |
| 31 | `aws.aurora_postgresql` | database.relational | PG Flexible / Cosmos DB for PG | ◐ | AlloyDB `gcp.alloydb` | ◐ |
| 32 | `aws.aurora_mysql` | database.relational | MySQL Flexible | ◐ | Cloud SQL MySQL | ◐ |
| 33 | `aws.aurora_serverless` | database.relational.serverless | PG Flexible (burstable) | ○ | AlloyDB / Cloud SQL (no true equiv) | ○ |
| 34 | `aws.dynamodb` | database.keyvalue | Cosmos DB (NoSQL API) `azure.cosmosdb` | ◐ (model differs: RU vs RCU/WCU, single-table idiom) | Firestore / Bigtable `gcp.firestore` | ○ |
| 35 | `aws.elasticache_redis` | database.cache | Azure Cache for Redis `azure.redis` | ● | Memorystore `gcp.memorystore` | ● |
| 36 | `aws.opensearch` | database.search | AI Search `azure.ai_search` | ◐ | Elastic on GCP / Vertex Search | ○ |
| 37 | `aws.redshift` | database.warehouse | Synapse / Fabric `azure.synapse` | ◐ | BigQuery `gcp.bigquery` | ◐ (serverless idiom) |
| 38 | `aws.documentdb` | database.document | Cosmos DB (Mongo API) | ◐ | Firestore | ○ |
| 39 | `aws.timestream` | database.timeseries | Data Explorer `azure.adx` | ◐ | Bigtable (pattern) | ○ |

## Storage

| # | AWS | Abstract type | Azure | Fid | GCP | Fid |
|---|---|---|---|---|---|---|
| 40 | `aws.s3` | storage.object | Blob Storage `azure.blob` | ● | Cloud Storage `gcp.gcs` | ● |
| 41 | `aws.ebs` | storage.block | Managed Disks `azure.disk` | ● | Persistent Disk `gcp.pd` | ● |
| 42 | `aws.efs` | storage.file | Azure Files `azure.files` | ● | Filestore `gcp.filestore` | ● |
| 43 | `aws.s3_glacier` | storage.archive | Blob Archive tier | ● | GCS Archive class | ● |
| 44 | `aws.backup` | storage.backup | Azure Backup `azure.backup` | ● | Backup and DR `gcp.backup_dr` | ◐ |

## Messaging & Integration

| # | AWS | Abstract type | Azure | Fid | GCP | Fid |
|---|---|---|---|---|---|---|
| 45 | `aws.sqs` | messaging.queue | Storage Queues / Service Bus Queues `azure.servicebus_queue` | ● | Pub/Sub (pull) `gcp.pubsub` | ◐ |
| 46 | `aws.sns` | messaging.topic | Service Bus Topics / Event Grid | ◐ | Pub/Sub `gcp.pubsub` | ◐ |
| 47 | `aws.eventbridge` | messaging.eventbus | Event Grid `azure.event_grid` | ◐ | Eventarc `gcp.eventarc` | ◐ |
| 48 | `aws.msk` | messaging.broker.kafka | Event Hubs (Kafka API) `azure.event_hubs` | ◐ | Managed Kafka `gcp.managed_kafka` | ● |
| 49 | `aws.kinesis` | messaging.stream | Event Hubs | ◐ | Pub/Sub / Dataflow | ◐ |
| 50 | `aws.step_functions` | integration.workflow | Logic Apps / Durable Functions `azure.logic_apps` | ◐ | Workflows `gcp.workflows` | ◐ |
| 51 | `aws.glue` | integration.etl | Data Factory `azure.adf` | ◐ | Dataflow / Dataform | ◐ |
| 52 | `aws.scheduler` | integration.scheduler | Logic Apps recurrence | ◐ | Cloud Scheduler `gcp.scheduler` | ● |

## Security, Identity & Operations

| # | AWS | Abstract type | Azure | Fid | GCP | Fid |
|---|---|---|---|---|---|---|
| 53 | `aws.iam` | security.identity | Entra ID + RBAC `azure.entra` | ◐ (model differs deeply) | Cloud IAM `gcp.iam` | ◐ |
| 54 | `aws.iam_role` | security.identity (principal) | Managed Identity `azure.managed_identity` | ◐ | Service Account `gcp.service_account` | ◐ |
| 55 | `aws.kms` | security.keys | Key Vault (keys) `azure.key_vault` | ● | Cloud KMS `gcp.kms` | ● |
| 56 | `aws.secrets_manager` | security.secrets | Key Vault (secrets) | ● | Secret Manager `gcp.secret_manager` | ● |
| 57 | `aws.acm` | security.certificate | Key Vault certs / App Service certs | ◐ | Certificate Manager `gcp.cert_manager` | ● |
| 58 | `aws.cognito` | security.identity.idp | Entra External ID `azure.entra_external` | ◐ | Identity Platform `gcp.identity_platform` | ◐ |
| 59 | `aws.cloudwatch` | observability.metrics+logs+alerting | Azure Monitor `azure.monitor` | ● | Cloud Monitoring/Logging `gcp.operations` | ● |
| 60 | `aws.cloudtrail` | security.audit | Activity Log + Purview | ◐ | Cloud Audit Logs `gcp.audit_logs` | ● |

## Property Schema Example (the per-service catalog artifact)

Each service ships a property schema consumed by pass-2 validation, the form generator
(doc 06), IaC templates, and cost mapping. Example for `aws.aurora_postgresql`:

```yaml
key: aws.aurora_postgresql
provider: aws
name: Amazon Aurora (PostgreSQL-compatible)
abstractTypes: [database.relational]
status: ga
icon: aws/database/aurora.svg
docs: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/
capabilities:        # inherited from database.relational, with service answers
  ha: { supported: true, mechanism: multi-az-replicas }
  serverlessMode: { supported: true, via: aws.aurora_serverless }
  maxStorageTb: 128
properties:          # JSON Schema fragment, merged over capability schema
  engineVersion: { type: string, enum: ["13","14","15","16"], default: "16" }
  instanceClass: { type: string, pattern: "^db\\.(r6g|r7g|x2g)\\..+", costDimension: instance_hours }
  replicas: { type: integer, minimum: 0, maximum: 15, default: 1 }
  multiAz: { type: boolean, default: true }
  storageEncrypted: { type: boolean, default: true, securityRelevant: true }
  kmsKeyRef: { type: string }
  globalDatabase: { type: boolean, default: false, costDimension: replication_gb }
  iamAuth: { type: boolean, default: false }
connectionRules:     # what may legally connect, drives canvas affordances + validation
  inbound: [{ kinds: [data], protocols: [postgres], from: [compute.*, integration.*] }]
  outbound: [{ kinds: [replication], to: [database.relational] }]
costDimensions:
  - { name: instance_hours, unit: hour, priceKey: "aurora.instance.{instanceClass}.{region}" }
  - { name: storage_gb_month, unit: gb-month, priceKey: "aurora.storage.{region}" }
  - { name: io_requests, unit: million, priceKey: "aurora.io.{region}", usageDriver: "rps * 0.4" }
iac:
  terraform: templates/aws/aurora_postgresql.tf.hbs
  cdk: templates/aws/aurora_postgresql.cdk.ts.hbs
  cloudformation: templates/aws/aurora_postgresql.cfn.yaml.hbs
equivalents:
  - { service: azure.pg_flexible, fidelity: 0.85, caveats: ["No storage auto-scaling parity", "Replica model differs"] }
  - { service: gcp.alloydb, fidelity: 0.82, caveats: ["Columnar engine differs", "Global database has no direct equivalent — use cross-region replicas"] }
evalCases:
  - "HA postgres for payments" must bind here or aws.rds with multiAz=true
  - generated model with globalDatabase=true must include ≥2 region groups
```

## Authoring Pipeline

```
catalog-repo (git) ──PR review──> CI: schema lint + template golden tests + icon check
        │                                   │
        └── per-release: catalog-publish ───┴──> immutable version "2026.06.1"
                 → Postgres (Catalog Service) → Neo4j (knowledge graph) → Redis (palette)
                 → embeddings refresh (pgvector) → BYOC signed bundle
```

Effort calibration: experienced engineer averages **1.5 services/day** fully done
(schema+templates+tests); 60 services ≈ 8 engineer-weeks — matches the dedicated catalog
engineer across Phase 1. Azure+GCP in Phase 2 are faster (~1 service/day each including
equivalence rows) because abstract capability schemas already exist.
