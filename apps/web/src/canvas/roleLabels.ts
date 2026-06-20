/**
 * Human role labels for abstract types — the architecture-diagram subtitle under a
 * service name (e.g. `database.relational` → "Relational database"). Keeps the canvas
 * reading like an AWS reference diagram instead of exposing catalog ids like `aws.rds`.
 */
const ROLE_LABEL: Record<string, string> = {
  'compute.vm': 'Virtual machine',
  'compute.vm.autoscaling_group': 'Auto Scaling group',
  'compute.serverless.function': 'Serverless function',
  'compute.serverless.app': 'Managed web app',
  'compute.container.orchestrator': 'Container cluster',
  'compute.container.orchestrator.service': 'Container service',
  'compute.container.registry': 'Container registry',
  'compute.container.instance': 'Serverless containers',
  'compute.batch': 'Batch compute',
  'database.relational': 'Relational database',
  'database.relational.serverless': 'Serverless database',
  'database.keyvalue': 'Key-value store',
  'database.cache': 'In-memory cache',
  'database.document': 'Document database',
  'database.search': 'Search & analytics',
  'database.warehouse': 'Data warehouse',
  'database.timeseries': 'Time-series database',
  'storage.object': 'Object storage',
  'storage.block': 'Block storage',
  'storage.file': 'File storage',
  'storage.archive': 'Archive storage',
  'storage.backup': 'Backup',
  'network.loadbalancer.l7': 'Load balancer (L7)',
  'network.loadbalancer.l4': 'Load balancer (L4)',
  'network.loadbalancer.global': 'Global accelerator',
  'network.cdn': 'Content delivery',
  'network.dns': 'DNS',
  'network.gateway.api': 'API gateway',
  'network.gateway.internet': 'Internet gateway',
  'network.gateway.nat': 'NAT gateway',
  'network.gateway.transit': 'Transit gateway',
  'network.gateway.vpn': 'VPN gateway',
  'network.firewall.network': 'Firewall',
  'network.firewall.waf': 'Web app firewall',
  'network.link.direct': 'Dedicated link',
  'network.link.peering': 'Peering',
  'network.endpoint.private': 'Private endpoint',
  'messaging.queue': 'Message queue',
  'messaging.topic': 'Pub/sub topic',
  'messaging.eventbus': 'Event bus',
  'messaging.stream': 'Data stream',
  'messaging.broker.kafka': 'Kafka broker',
  'integration.workflow': 'Workflow',
  'integration.etl': 'ETL',
  'integration.scheduler': 'Scheduler',
  'security.identity': 'Identity & access',
  'security.identity.principal': 'IAM role',
  'security.identity.idp': 'Identity provider',
  'security.keys': 'Encryption keys',
  'security.secrets': 'Secrets',
  'security.certificate': 'Certificates',
  'security.audit': 'Audit trail',
  'observability.metrics': 'Monitoring',
  'observability.logs': 'Logging',
  'observability.alerting': 'Alerting',
};

/** A friendly role label for an abstract type; falls back to a humanized leaf segment. */
export function roleLabel(type?: string): string {
  if (!type) return '';
  const exact = ROLE_LABEL[type];
  if (exact) return exact;
  const leaf = (type.split('.').pop() ?? type).replace(/_/g, ' ');
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}
