import type { CamlGroup, ProjectableModel } from './projector';

/**
 * Group-kind nesting rules (blueprint doc 05 / schema Group.parent note: subnet ⊂
 * network ⊂ region). When a kind is listed: if it has a parent, the parent's kind must be
 * in the allowed set; if `requiresParent`, it may not be top-level either. This catches both
 * a misplaced subnet AND the AWS-impossible nestings (a VPC inside a VPC/subnet — the `test2`
 * repro — a subnet inside a subnet, …). Kinds not listed are unconstrained for now.
 */
const ALLOWED_PARENT_KINDS: Record<string, { allowed: string[]; requiresParent: boolean }> = {
  subnet: { allowed: ['network', 'zone'], requiresParent: true }, // a subnet sits in a VPC, or in an AZ band (Day 71)
  zone: { allowed: ['network'], requiresParent: true }, // an Availability Zone groups subnets within a VPC
  network: { allowed: ['region'], requiresParent: false }, // a VPC is top-level or grouped under a region — never inside a VPC/subnet/zone
};

export interface ContainmentViolation {
  groupId: string;
  message: string;
}

/**
 * Surface containment violations for the model's groups (e.g. a subnet not inside a network,
 * or a VPC nested inside another VPC). Pure + deterministic — drives inspector warnings and
 * node badges.
 */
export function containmentViolations(model: ProjectableModel): ContainmentViolation[] {
  const byId = new Map<string, CamlGroup>((model.groups ?? []).map((g) => [g.id, g]));
  const violations: ContainmentViolation[] = [];

  for (const g of model.groups ?? []) {
    const rule = ALLOWED_PARENT_KINDS[g.kind];
    if (!rule) continue;
    const parent = g.parent ? byId.get(g.parent) : undefined;
    if (parent) {
      if (!rule.allowed.includes(parent.kind)) {
        const article = g.kind === 'network' ? 'A VPC' : `A ${g.kind}`;
        violations.push({ groupId: g.id, message: `${article} cannot be nested inside a ${parent.kind} (must be in a ${rule.allowed.join(' or ')})` });
      }
    } else if (rule.requiresParent) {
      violations.push({ groupId: g.id, message: `A ${g.kind} must live inside a ${rule.allowed.join(' or ')}` });
    }
  }
  return violations;
}

/** The set of group ids with a containment violation (for quick node-badge lookup). */
export function violatingGroupIds(model: ProjectableModel): Set<string> {
  return new Set(containmentViolations(model).map((v) => v.groupId));
}
