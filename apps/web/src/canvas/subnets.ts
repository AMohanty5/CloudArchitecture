/**
 * Subnet purpose/role (Day 72, docs/canvas-composition.md §4). Beyond public/private, a
 * subnet has an architectural *role* that drives its lane label and left-to-right tier
 * ordering. Sourced from `properties.role` when set, else inferred from what it contains.
 */

export type SubnetRole = 'web' | 'app' | 'data' | 'shared' | 'management' | 'transit';

const ROLES: readonly SubnetRole[] = ['web', 'app', 'data', 'shared', 'management', 'transit'];

const isEdge = (t: string): boolean =>
  t.startsWith('network.loadbalancer') || t.startsWith('network.cdn') || t.startsWith('network.gateway') || t.startsWith('network.firewall.waf');

/** Infer a role from member abstract types: edge → web, compute → app, data/storage → data. */
export function inferSubnetRole(memberTypes: string[]): SubnetRole {
  if (memberTypes.some(isEdge)) return 'web';
  if (memberTypes.some((t) => t.startsWith('compute.'))) return 'app';
  if (memberTypes.some((t) => t.startsWith('database.') || t.startsWith('storage.'))) return 'data';
  if (memberTypes.some((t) => t.startsWith('network.gateway.transit') || t.startsWith('network.link'))) return 'transit';
  return 'shared';
}

/** Resolve a subnet's role: an explicit, valid `properties.role` wins; else inferred. */
export function subnetRole(roleProp: unknown, memberTypes: string[]): SubnetRole {
  const explicit = typeof roleProp === 'string' ? (roleProp.toLowerCase() as SubnetRole) : undefined;
  return explicit && ROLES.includes(explicit) ? explicit : inferSubnetRole(memberTypes);
}

/** Flow tier for ordering subnet lanes left-to-right (transit → web → app/shared → data → mgmt). */
const ROLE_TIER: Record<SubnetRole, number> = { transit: 0, web: 1, app: 2, shared: 2, data: 3, management: 4 };
export function roleTier(role: SubnetRole): number {
  return ROLE_TIER[role];
}
