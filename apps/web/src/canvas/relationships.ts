/**
 * AWS semantic relationship classification (docs/aws-relationship-model.md §1). Maps an
 * edge — its endpoint abstract types + connection `kind` — to one of the relationship
 * classes that render differently: an attachment, a security control, an IAM assumption,
 * or a runtime communication. Day 53 renders by class (compartments / badges / lines);
 * Day 52 establishes the classifier. Pure + deterministic.
 *
 * CONTAINS (region▸vpc▸subnet▸resource) is group membership, not an edge, so it is not
 * produced here.
 */

export type RelationshipClass = 'attached_to' | 'secured_by' | 'assumes' | 'communicates_with';

/** Connection kinds that always model a runtime interaction (the only ones drawn as lines). */
const COMMUNICATION_KINDS = new Set(['traffic', 'data', 'async', 'replication', 'observability']);

// Only an IAM *role/principal* is assumed — not an IdP (Cognito) or the IAM service itself.
const isPrincipal = (t: string): boolean => t.startsWith('security.identity.principal');
const isSecurityControl = (t: string): boolean =>
  t.startsWith('network.firewall') || // security group / NACL
  t.startsWith('security.keys') || // KMS
  t.startsWith('security.secrets'); // Secrets Manager
const isAttachable = (t: string): boolean =>
  t.startsWith('storage.block') || // EBS
  t.startsWith('storage.file') || // EFS
  t.startsWith('network.interface'); // ENI (future)

/**
 * Classify an edge by its endpoints' abstract types and connection kind. The order of
 * checks encodes precedence: an identity edge involving an IAM principal is an
 * assumption; a structural `dependency` involving a firewall/key is a security control,
 * otherwise an attachment; everything else is a runtime communication.
 */
export function classifyRelationship(fromType: string, toType: string, kind: string): RelationshipClass {
  if (COMMUNICATION_KINDS.has(kind)) return 'communicates_with';

  if (kind === 'identity') {
    // IAM principal ↔ compute = assumes. IAM principal → a non-compute resource is a
    // permission *grant* (rendered as a badge on the resource, never a line) — also folded,
    // so it is classed here as a non-communication relationship rather than a flow.
    if (isPrincipal(fromType) || isPrincipal(toType)) return 'assumes';
    return 'communicates_with'; // e.g. Cognito auth flow
  }

  if (kind === 'dependency') {
    if (isSecurityControl(fromType) || isSecurityControl(toType)) return 'secured_by';
    if (isAttachable(fromType) || isAttachable(toType)) return 'attached_to';
    return 'attached_to'; // a bare structural dependency is an attachment (e.g. ECR pull)
  }

  // peering and any unknown kind: treat as communication (network linking).
  return 'communicates_with';
}

/** Whether a classified relationship is folded into a node (true) or drawn as a line (false). */
export function isFolded(rel: RelationshipClass): boolean {
  return rel !== 'communicates_with';
}

/** Visual bucket a folded relationship renders into on its owner node. */
export type FoldBucket = 'attachments' | 'security' | 'identity';

/** Map a folded class to its render bucket; null for communicates_with (drawn as a line). */
export function foldBucket(rel: RelationshipClass): FoldBucket | null {
  switch (rel) {
    case 'attached_to':
      return 'attachments';
    case 'secured_by':
      return 'security';
    case 'assumes':
      return 'identity';
    default:
      return null;
  }
}

/**
 * Which endpoint of a folded edge is the *secondary* (the one folded into the other) —
 * the attachable storage, the security control, or the IAM principal. The other endpoint
 * is the owner the fold renders onto. Returns null when neither side qualifies (the caller
 * then leaves the edge as a line).
 */
export function secondarySide(fromType: string, toType: string, rel: RelationshipClass): 'from' | 'to' | null {
  const test =
    rel === 'attached_to' ? isAttachable : rel === 'secured_by' ? isSecurityControl : rel === 'assumes' ? isPrincipal : null;
  if (!test) return null;
  if (test(fromType)) return 'from';
  if (test(toType)) return 'to';
  return null;
}
