/**
 * Architecture templates (Stage G, Day 42). Each is a small, pass-1/pass-2-valid CAML
 * body (groups + components + connections) seeded into a fresh architecture so a user
 * starts from a polished reference instead of a blank canvas. Bindings reference real
 * catalog services; component `type`s are compatible with their service's abstract types;
 * group nesting follows region ⊃ network ⊃ subnet.
 */
import type { CamlComponent, CamlConnection, CamlGroup } from './projector';

export interface ArchitectureTemplate {
  key: string;
  label: string;
  description: string;
  defaultName: string;
  model: { groups: CamlGroup[]; components: CamlComponent[]; connections: CamlConnection[] };
}

const aws = (service: string) => ({ provider: 'aws', service });

/** region ⊃ network ⊃ subnet scaffold shared by the VPC-based templates. */
function vpcScaffold(): CamlGroup[] {
  return [
    { id: 'region-use1', kind: 'region', name: 'us-east-1', provider: 'aws' },
    { id: 'vpc-main', kind: 'network', name: 'Production VPC', parent: 'region-use1', properties: { cidr: '10.0.0.0/16' } },
    { id: 'subnet-public-a', kind: 'subnet', name: 'Public · az-a', parent: 'vpc-main', properties: { cidr: '10.0.1.0/24', zone: 'us-east-1a', public: true } },
    { id: 'subnet-app-a', kind: 'subnet', name: 'Private · az-a', parent: 'vpc-main', properties: { cidr: '10.0.10.0/24', zone: 'us-east-1a', public: false } },
  ];
}

export const TEMPLATES: ArchitectureTemplate[] = [
  {
    key: 'three-tier',
    label: '3-tier web app',
    description: 'VPC · ALB · EC2 Auto Scaling · RDS (PostgreSQL)',
    defaultName: '3-tier web app',
    model: {
      groups: vpcScaffold(),
      components: [
        { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Web load balancer', binding: aws('aws.alb'), group: 'subnet-public-a', properties: { scheme: 'internet-facing' } },
        { id: 'app-asg', type: 'compute.vm.autoscaling_group', name: 'App tier', binding: aws('aws.ec2_asg'), group: 'subnet-app-a' },
        { id: 'orders-db', type: 'database.relational', name: 'Orders DB', binding: aws('aws.rds'), group: 'subnet-app-a', properties: { engine: 'postgres', instanceClass: 'db.r6g.large', multiAz: true, storageEncrypted: true } },
      ],
      connections: [
        { id: 'lb-app', from: 'web-lb', to: 'app-asg', kind: 'traffic', properties: { protocol: 'https', port: 443 } },
        { id: 'app-db', from: 'app-asg', to: 'orders-db', kind: 'data', properties: { protocol: 'postgres', port: 5432 } },
      ],
    },
  },
  {
    key: 'serverless-api',
    label: 'Serverless API',
    description: 'API Gateway · Lambda · DynamoDB · S3',
    defaultName: 'Serverless API',
    model: {
      groups: [{ id: 'region-use1', kind: 'region', name: 'us-east-1', provider: 'aws' }],
      components: [
        { id: 'api', type: 'network.gateway.api', name: 'HTTP API', binding: aws('aws.api_gateway'), group: 'region-use1' },
        { id: 'fn', type: 'compute.serverless.function', name: 'Request handler', binding: aws('aws.lambda'), group: 'region-use1', properties: { runtime: 'nodejs20.x', memoryMb: 512 } },
        { id: 'table', type: 'database.keyvalue', name: 'App table', binding: aws('aws.dynamodb'), group: 'region-use1' },
        { id: 'assets', type: 'storage.object', name: 'Assets bucket', binding: aws('aws.s3'), group: 'region-use1', properties: { storageEncrypted: true } },
      ],
      connections: [
        { id: 'api-fn', from: 'api', to: 'fn', kind: 'traffic', properties: { protocol: 'https' } },
        { id: 'fn-table', from: 'fn', to: 'table', kind: 'data' },
        { id: 'fn-assets', from: 'fn', to: 'assets', kind: 'data' },
      ],
    },
  },
  {
    key: 'eks-platform',
    label: 'EKS platform',
    description: 'VPC · ALB · EKS cluster + workload · ECR · RDS',
    defaultName: 'EKS platform',
    model: {
      groups: vpcScaffold(),
      components: [
        { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Ingress LB', binding: aws('aws.alb'), group: 'subnet-public-a', properties: { scheme: 'internet-facing' } },
        { id: 'eks-cluster', type: 'compute.container.orchestrator', name: 'EKS cluster', binding: aws('aws.eks'), group: 'subnet-app-a' },
        { id: 'api-workload', type: 'compute.container.orchestrator.service', name: 'API service', binding: aws('aws.eks_service'), group: 'subnet-app-a' },
        { id: 'registry', type: 'compute.container.registry', name: 'Image registry', binding: aws('aws.ecr'), group: 'region-use1' },
        { id: 'app-db', type: 'database.relational', name: 'App DB', binding: aws('aws.rds'), group: 'subnet-app-a', properties: { engine: 'postgres', multiAz: true, storageEncrypted: true } },
      ],
      connections: [
        { id: 'lb-svc', from: 'web-lb', to: 'api-workload', kind: 'traffic', properties: { protocol: 'https', port: 443 } },
        { id: 'svc-db', from: 'api-workload', to: 'app-db', kind: 'data', properties: { protocol: 'postgres', port: 5432 } },
        { id: 'svc-ecr', from: 'api-workload', to: 'registry', kind: 'dependency' },
        { id: 'eks-ecr', from: 'eks-cluster', to: 'registry', kind: 'dependency' },
      ],
    },
  },
  {
    key: 'data-lake',
    label: 'Data lake',
    description: 'Kinesis · Glue ETL · S3 · Redshift · OpenSearch',
    defaultName: 'Data lake',
    model: {
      groups: [{ id: 'region-use1', kind: 'region', name: 'us-east-1', provider: 'aws' }],
      components: [
        { id: 'ingest', type: 'messaging.stream', name: 'Ingest stream', binding: aws('aws.kinesis'), group: 'region-use1' },
        { id: 'etl', type: 'integration.etl', name: 'ETL jobs', binding: aws('aws.glue'), group: 'region-use1' },
        { id: 'lake', type: 'storage.object', name: 'Data lake', binding: aws('aws.s3'), group: 'region-use1', properties: { storageEncrypted: true } },
        { id: 'warehouse', type: 'database.warehouse', name: 'Warehouse', binding: aws('aws.redshift'), group: 'region-use1' },
        { id: 'search', type: 'database.search', name: 'Search index', binding: aws('aws.opensearch'), group: 'region-use1' },
      ],
      connections: [
        { id: 'ingest-etl', from: 'ingest', to: 'etl', kind: 'async' },
        { id: 'etl-lake', from: 'etl', to: 'lake', kind: 'data' },
        { id: 'etl-wh', from: 'etl', to: 'warehouse', kind: 'data' },
        { id: 'lake-search', from: 'lake', to: 'search', kind: 'data' },
      ],
    },
  },
  {
    key: 'layered-platform',
    label: 'Layered platform',
    description: 'Channels → Edge → Application → Data → Security (section bands)',
    defaultName: 'Layered platform',
    model: {
      groups: [
        { id: 'tier-channels', kind: 'tier', name: '1 · Channels' },
        { id: 'tier-edge', kind: 'tier', name: '2 · Edge & API' },
        { id: 'tier-app', kind: 'tier', name: '3 · Application' },
        { id: 'tier-data', kind: 'tier', name: '4 · Data' },
        { id: 'tier-security', kind: 'tier', name: '5 · Security' },
      ],
      components: [
        { id: 'cdn', type: 'network.cdn', name: 'CDN', binding: aws('aws.cloudfront'), group: 'tier-channels' },
        { id: 'waf', type: 'network.firewall.waf', name: 'WAF', binding: aws('aws.waf'), group: 'tier-channels' },
        { id: 'api', type: 'network.gateway.api', name: 'API Gateway', binding: aws('aws.api_gateway'), group: 'tier-edge' },
        { id: 'lb', type: 'network.loadbalancer.l7', name: 'Load balancer', binding: aws('aws.alb'), group: 'tier-edge' },
        { id: 'fn', type: 'compute.serverless.function', name: 'Functions', binding: aws('aws.lambda'), group: 'tier-app' },
        { id: 'svc', type: 'compute.container.orchestrator.service', name: 'Service', binding: aws('aws.ecs_service'), group: 'tier-app' },
        { id: 'queue', type: 'messaging.queue', name: 'Queue', binding: aws('aws.sqs'), group: 'tier-app' },
        { id: 'table', type: 'database.keyvalue', name: 'Table', binding: aws('aws.dynamodb'), group: 'tier-data' },
        { id: 'db', type: 'database.relational', name: 'Database', binding: aws('aws.rds'), group: 'tier-data', properties: { engine: 'postgres', multiAz: true, storageEncrypted: true } },
        { id: 'cache', type: 'database.cache', name: 'Cache', binding: aws('aws.elasticache_redis'), group: 'tier-data' },
        { id: 'kms', type: 'security.keys', name: 'KMS', binding: aws('aws.kms'), group: 'tier-security' },
        { id: 'secrets', type: 'security.secrets', name: 'Secrets', binding: aws('aws.secrets_manager'), group: 'tier-security' },
        { id: 'iam', type: 'security.identity', name: 'IAM', binding: aws('aws.iam'), group: 'tier-security' },
      ],
      connections: [
        { id: 'cdn-api', from: 'cdn', to: 'api', kind: 'traffic' },
        { id: 'api-fn', from: 'api', to: 'fn', kind: 'traffic' },
        { id: 'lb-svc', from: 'lb', to: 'svc', kind: 'traffic' },
        { id: 'fn-table', from: 'fn', to: 'table', kind: 'data' },
        { id: 'svc-db', from: 'svc', to: 'db', kind: 'data' },
        { id: 'fn-cache', from: 'fn', to: 'cache', kind: 'data' },
        { id: 'fn-secrets', from: 'fn', to: 'secrets', kind: 'dependency' },
        { id: 'db-kms', from: 'db', to: 'kms', kind: 'dependency' },
      ],
    },
  },
  {
    key: 'multi-az-ha',
    label: 'Multi-AZ HA',
    description: 'Two AZs · ALB · EC2 ASG per AZ · Multi-AZ RDS',
    defaultName: 'Multi-AZ HA',
    model: {
      groups: [
        { id: 'region-use1', kind: 'region', name: 'us-east-1', provider: 'aws' },
        { id: 'vpc-main', kind: 'network', name: 'Production VPC', parent: 'region-use1', properties: { cidr: '10.0.0.0/16' } },
        { id: 'subnet-public-a', kind: 'subnet', name: 'Public · az-a', parent: 'vpc-main', properties: { cidr: '10.0.1.0/24', zone: 'us-east-1a', public: true } },
        { id: 'subnet-public-b', kind: 'subnet', name: 'Public · az-b', parent: 'vpc-main', properties: { cidr: '10.0.2.0/24', zone: 'us-east-1b', public: true } },
        { id: 'subnet-app-a', kind: 'subnet', name: 'Private · az-a', parent: 'vpc-main', properties: { cidr: '10.0.10.0/24', zone: 'us-east-1a', public: false } },
        { id: 'subnet-app-b', kind: 'subnet', name: 'Private · az-b', parent: 'vpc-main', properties: { cidr: '10.0.11.0/24', zone: 'us-east-1b', public: false } },
      ],
      components: [
        { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Web load balancer', binding: aws('aws.alb'), group: 'subnet-public-a', properties: { scheme: 'internet-facing' } },
        { id: 'app-asg-a', type: 'compute.vm.autoscaling_group', name: 'App tier · az-a', binding: aws('aws.ec2_asg'), group: 'subnet-app-a' },
        { id: 'app-asg-b', type: 'compute.vm.autoscaling_group', name: 'App tier · az-b', binding: aws('aws.ec2_asg'), group: 'subnet-app-b' },
        { id: 'orders-db', type: 'database.relational', name: 'Orders DB (Multi-AZ)', binding: aws('aws.rds'), group: 'subnet-app-a', properties: { engine: 'postgres', multiAz: true, storageEncrypted: true } },
      ],
      connections: [
        { id: 'lb-a', from: 'web-lb', to: 'app-asg-a', kind: 'traffic', properties: { protocol: 'https', port: 443 } },
        { id: 'lb-b', from: 'web-lb', to: 'app-asg-b', kind: 'traffic', properties: { protocol: 'https', port: 443 } },
        { id: 'a-db', from: 'app-asg-a', to: 'orders-db', kind: 'data', properties: { protocol: 'postgres', port: 5432 } },
        { id: 'b-db', from: 'app-asg-b', to: 'orders-db', kind: 'data', properties: { protocol: 'postgres', port: 5432 } },
      ],
    },
  },
];
