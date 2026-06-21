import type { CatalogService } from '@cac/catalog';

export interface RankedService {
  service: CatalogService;
  score: number;
}

/**
 * Search aliases/keywords per service (Day 81) so common terminology resolves even when it
 * is not in the name or type — e.g. "nosql"→DynamoDB, "object storage"→S3, "load balancer"
 * →ALB/NLB, "cache"→ElastiCache, "queue"→SQS, "firewall"→Security Group, "cdn"→CloudFront.
 */
const KEYWORDS: Record<string, string[]> = {
  'aws.ec2': ['instance', 'vm', 'server', 'virtual machine'],
  'aws.lambda': ['serverless', 'function', 'faas'],
  'aws.s3': ['object storage', 'bucket', 'blob'],
  'aws.ebs': ['block storage', 'volume', 'disk'],
  'aws.efs': ['file storage', 'nfs', 'shared'],
  'aws.dynamodb': ['nosql', 'key value', 'document'],
  'aws.rds': ['sql', 'relational', 'postgres', 'mysql'],
  'aws.aurora_postgresql': ['sql', 'postgres', 'relational'],
  'aws.aurora_mysql': ['sql', 'mysql', 'relational'],
  'aws.elasticache_redis': ['cache', 'redis', 'in memory'],
  'aws.opensearch': ['search', 'elasticsearch', 'index'],
  'aws.redshift': ['warehouse', 'olap', 'analytics'],
  'aws.sqs': ['queue', 'message'],
  'aws.sns': ['pub sub', 'topic', 'notification'],
  'aws.eventbridge': ['events', 'event bus'],
  'aws.kinesis': ['stream', 'streaming'],
  'aws.glue': ['etl', 'data pipeline'],
  'aws.step_functions': ['workflow', 'orchestration', 'state machine'],
  'aws.alb': ['load balancer', 'l7', 'application'],
  'aws.nlb': ['load balancer', 'l4'],
  'aws.cloudfront': ['cdn', 'edge', 'content delivery'],
  'aws.route53': ['dns', 'domain'],
  'aws.api_gateway': ['api', 'rest', 'http'],
  'aws.kms': ['encryption', 'keys', 'crypto'],
  'aws.secrets_manager': ['secrets', 'credentials'],
  'aws.cognito': ['auth', 'login', 'identity provider', 'idp'],
  'aws.acm': ['certificate', 'tls', 'ssl'],
  'aws.security_group': ['firewall', 'sg'],
  'aws.nacl': ['firewall', 'acl', 'network acl'],
  'aws.iam': ['identity', 'permissions', 'access'],
  'aws.iam_role': ['role', 'identity', 'permissions'],
  'aws.vpc': ['network', 'virtual private cloud'],
  'aws.cloudwatch': ['monitoring', 'metrics', 'logs', 'observability'],
};

/** Lowercased haystacks searched per service, weighted by field. */
function haystacks(s: CatalogService): { name: string; key: string; types: string; caps: string; keywords: string } {
  return {
    name: s.name.toLowerCase(),
    key: s.key.toLowerCase(),
    types: [...(s.abstractTypes ?? []), s.groupKind ?? ''].join(' ').toLowerCase(),
    caps: Object.keys(s.capabilities ?? {}).join(' ').toLowerCase(),
    keywords: (KEYWORDS[s.key] ?? []).join(' '),
  };
}

function scoreService(s: CatalogService, query: string, tokens: string[]): number {
  const h = haystacks(s);
  let score = 0;
  if (h.name === query || h.key === query) score += 100;
  for (const t of tokens) {
    if (h.name.includes(t)) score += 10;
    if (h.key.includes(t)) score += 6;
    if (h.keywords.includes(t)) score += 5; // alias/keyword match
    if (h.types.includes(t)) score += 4;
    if (h.caps.includes(t)) score += 2;
  }
  // The full query as a phrase in name or keywords (e.g. "load balancer", "object storage").
  if (query && (h.name.includes(query) || h.keywords.includes(query))) score += 12;
  if (tokens.length > 0 && tokens.every((t) => h.name.includes(t))) score += 20; // all query words in the name
  return score;
}

/**
 * Rank catalog services for the palette. With no query, returns all (optionally
 * provider-filtered) sorted by name; with a query, returns only matches sorted by
 * relevance then key. Pure + deterministic — the search endpoint's core.
 */
export function rankServices(
  services: CatalogService[],
  opts: { q?: string; provider?: string } = {},
): RankedService[] {
  let pool = services;
  if (opts.provider) pool = pool.filter((s) => s.provider === opts.provider);

  const query = (opts.q ?? '').trim().toLowerCase();
  if (!query) {
    return [...pool]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((service) => ({ service, score: 0 }));
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  return pool
    .map((service) => ({ service, score: scoreService(service, query, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.service.key.localeCompare(b.service.key));
}
