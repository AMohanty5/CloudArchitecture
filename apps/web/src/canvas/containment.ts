import type { CamlGroup, ProjectableModel } from './projector';

/**
 * Group-kind nesting rules (blueprint doc 05 / schema Group.parent note: subnet ⊂
 * network ⊂ region). A kind listed here must nest under one of the given parent
 * kinds; kinds not listed are unconstrained for now (pass-3 will generalise this).
 */
const REQUIRED_PARENT_KINDS: Record<string, string[]> = {
  subnet: ['network', 'zone'], // a subnet sits in a VPC directly, or inside an AZ band (Day 71)
  zone: ['network'], // an Availability Zone groups subnets within a VPC
};

export interface ContainmentViolation {
  groupId: string;
  message: string;
}

/**
 * Surface containment violations for the model's groups (e.g. a subnet that is not
 * inside a network). Pure + deterministic — drives inspector warnings and node badges.
 */
export function containmentViolations(model: ProjectableModel): ContainmentViolation[] {
  const byId = new Map<string, CamlGroup>((model.groups ?? []).map((g) => [g.id, g]));
  const violations: ContainmentViolation[] = [];

  for (const g of model.groups ?? []) {
    const required = REQUIRED_PARENT_KINDS[g.kind];
    if (!required) continue;
    const parent = g.parent ? byId.get(g.parent) : undefined;
    if (!parent || !required.includes(parent.kind)) {
      violations.push({ groupId: g.id, message: `A ${g.kind} must live inside a ${required.join(' or ')}` });
    }
  }
  return violations;
}

/** The set of group ids with a containment violation (for quick node-badge lookup). */
export function violatingGroupIds(model: ProjectableModel): Set<string> {
  return new Set(containmentViolations(model).map((v) => v.groupId));
}
