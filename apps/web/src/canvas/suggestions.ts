import { evaluateConnection } from './connections';
import type { ConnectionRules } from '../lib/queries';

/**
 * Context-aware suggestions (Day 84, docs/sidebar-redesign.md §8). When a resource is
 * selected, suggest the services that can attach/connect to it — derived from the catalog
 * connection rules — ordered by a small curated boost per type (e.g. selecting EC2 surfaces
 * Security Group, IAM Role, EBS, ALB first). Pure + deterministic.
 */

export interface SuggestService {
  key: string;
  type: string;
  rules?: ConnectionRules;
}

/** Curated ordering of the most common pairings, matched by type prefix. */
const BOOST: ReadonlyArray<{ prefix: string; keys: string[] }> = [
  { prefix: 'compute.vm', keys: ['aws.security_group', 'aws.iam_role', 'aws.ebs', 'aws.alb'] },
  { prefix: 'compute.serverless.function', keys: ['aws.iam_role', 'aws.dynamodb', 'aws.s3', 'aws.sqs'] },
  { prefix: 'compute.container', keys: ['aws.security_group', 'aws.iam_role', 'aws.ecr', 'aws.alb'] },
  { prefix: 'database.relational', keys: ['aws.security_group', 'aws.secrets_manager', 'aws.kms'] },
  { prefix: 'network.loadbalancer', keys: ['aws.acm', 'aws.security_group', 'aws.waf'] },
  { prefix: 'storage.object', keys: ['aws.cloudfront', 'aws.iam_role'] },
];
function boostFor(type: string): string[] {
  return BOOST.find((b) => type.startsWith(b.prefix))?.keys ?? [];
}

/**
 * Suggest service keys to attach to the selected resource: candidates are services whose
 * catalog rules permit a connection in either direction, excluding `exclude` (the resource's
 * own service + services already connected to it). Curated pairings come first, then the rest
 * by key, capped.
 */
export function suggestFor(
  selected: { type: string; rules?: ConnectionRules },
  services: SuggestService[],
  exclude: Set<string>,
  cap = 4,
): string[] {
  const candidates = services.filter(
    (s) =>
      !exclude.has(s.key) &&
      s.type !== '' &&
      (evaluateConnection({ type: s.type, rules: s.rules }, selected).allowed ||
        evaluateConnection(selected, { type: s.type, rules: s.rules }).allowed),
  );
  const candidateKeys = new Set(candidates.map((c) => c.key));
  const boosted = boostFor(selected.type).filter((k) => candidateKeys.has(k));
  const rest = candidates
    .map((c) => c.key)
    .filter((k) => !boosted.includes(k))
    .sort();
  return [...boosted, ...rest].slice(0, cap);
}
