import type { Component, Connection } from '@cac/caml';
import type { ConnectionKnowledge } from '@cac/catalog';
import type { Finding, Rule, RuleContext } from './engine';

/**
 * Baseline rule pack v1 (blueprint doc 16). A representative starter set spanning
 * the doc's implementation patterns: simple predicate (SEC-001), public-subnet
 * containment (SEC-004), graph reachability with allowed intermediaries (SEC-002),
 * requirement-gated precondition (REL-001), pinned-scaling predicate (REL-007),
 * and criticality-modulated severity (OPS-001). Each ships with positive +
 * negative fixtures in the tests. More rules land on later days; the engine and
 * report shape are frozen.
 */

const PACK_VERSION = 'pack/dev';

const isDatastore = (c: Component): boolean => c.type.startsWith('database.') || c.type.startsWith('storage.');
const isDatabase = (c: Component): boolean => c.type.startsWith('database.');
const isAllowedIntermediary = (c: Component): boolean =>
  c.type.startsWith('network.firewall.waf') || c.type.startsWith('network.gateway.api');
const isInstance = (c: Component): boolean => c.type.startsWith('compute.vm');
const isNetworkFirewall = (c: Component): boolean => c.type.startsWith('network.firewall.network');
const isCompute = (c: Component): boolean => c.type.startsWith('compute.');
const isPrincipal = (c: Component): boolean => c.type.startsWith('security.identity.principal');
/** Resources that only make sense attached to something else (folded relationships, doc: aws-relationship-model). */
const isAttachmentResource = (c: Component): boolean =>
  c.type.startsWith('storage.block') ||
  c.type.startsWith('storage.file') ||
  c.type.startsWith('network.firewall.network') ||
  isPrincipal(c);
const isInternetEntry = (c: Component): boolean =>
  c.type.startsWith('user.') ||
  c.type.startsWith('external.') ||
  (c.type.startsWith('network.loadbalancer') &&
    (c.properties?.scheme === 'internet-facing' || c.properties?.internal === false));

const finding = (
  rule: Pick<Rule, 'id' | 'title' | 'category'>,
  severity: Finding['severity'],
  targetId: string,
  message: string,
  extra: Partial<Pick<Finding, 'remediation' | 'autoFixable' | 'fix'>> = {},
): Finding => ({ ruleId: rule.id, title: rule.title, category: rule.category, severity, targetId, message, ...extra });

const SEC_001: Rule = {
  id: 'SEC-001',
  title: 'Datastore is not encrypted at rest',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    return ctx.components
      .filter((c) => (c.type.startsWith('database.') || c.type === 'storage.object') && c.properties?.storageEncrypted === false)
      .map((c) =>
        finding(SEC_001, 'critical', c.id, `${c.name} stores data with encryption at rest disabled.`, {
          remediation: 'Set properties.storageEncrypted to true.',
          autoFixable: true,
          fix: { kind: 'setProperty', key: 'storageEncrypted', value: true },
        }),
      );
  },
};

const SEC_004: Rule = {
  id: 'SEC-004',
  title: 'Datastore in a public subnet',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    for (const c of ctx.components) {
      if (!(c.type.startsWith('database.') || c.type === 'storage.block')) continue;
      const subnet = ctx.enclosingGroupOfKind(c.id, 'subnet');
      if (subnet?.properties?.public === true) {
        out.push(
          finding(SEC_004, 'critical', c.id, `${c.name} sits in public subnet "${subnet.name}".`, {
            remediation: 'Move the datastore to a private subnet.',
          }),
        );
      }
    }
    return out;
  },
};

const SEC_002: Rule = {
  id: 'SEC-002',
  title: 'Database reachable from the internet without a WAF',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const entry of ctx.components.filter(isInternetEntry)) {
      const reached = ctx.reaches(entry.id, isDatabase, isAllowedIntermediary);
      if (!reached) continue;
      const key = `${entry.id}->${reached.hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        finding(
          SEC_002,
          'critical',
          reached.hit.id,
          `${reached.hit.name} is reachable from internet-facing ${entry.name} with no WAF or API gateway in the path.`,
          { remediation: 'Insert a WAF/API gateway in the path, or move the database to a private subnet.' },
        ),
      );
    }
    return out;
  },
};

const REL_001: Rule = {
  id: 'REL-001',
  title: 'Stateful component is not multi-AZ',
  category: 'reliability',
  evaluate(ctx: RuleContext): Finding[] {
    const hasAvailabilityReq = ctx.requirements.some((r) => r.kind === 'availability');
    const hasRedundancyPolicy = (ctx.model.policies ?? []).some((p) => p.kind === 'reliability.redundancy');
    if (!hasAvailabilityReq && !hasRedundancyPolicy) return [];
    return ctx.components
      .filter((c) => isDatastore(c) && c.type.startsWith('database.') && c.properties?.multiAz !== true)
      .map((c) =>
        finding(REL_001, 'high', c.id, `${c.name} is single-AZ, but the design declares an availability requirement.`, {
          remediation: 'Enable multi-AZ (set properties.multiAz to true).',
        }),
      );
  },
};

const REL_007: Rule = {
  id: 'REL-007',
  title: 'Autoscaling group is pinned (min == max)',
  category: 'reliability',
  evaluate(ctx: RuleContext): Finding[] {
    return ctx.components
      .filter(
        (c) =>
          c.type === 'compute.vm.autoscaling_group' &&
          c.scaling?.min !== undefined &&
          c.scaling.min === c.scaling.max,
      )
      .map((c) =>
        finding(REL_007, 'medium', c.id, `${c.name} has autoscaling configured but pinned (min == max == ${c.scaling!.min}).`, {
          remediation: 'Raise max above min, or drop the scaling block if a fixed size is intended.',
        }),
      );
  },
};

const SEC_005: Rule = {
  id: 'SEC-005',
  title: 'Instance has no security group',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    // A compute instance should sit behind a security group — modeled as a
    // `network.firewall.network` component associated via a `dependency` edge (drawn
    // either direction; Day 46 normalizes it). Flags instances with no such association.
    const guarded = new Set<string>();
    for (const cn of ctx.connections) {
      if (cn.kind !== 'dependency') continue;
      const a = ctx.componentsById.get(cn.from);
      const b = ctx.componentsById.get(cn.to);
      if (!a || !b) continue;
      if (isInstance(a) && isNetworkFirewall(b)) guarded.add(a.id);
      if (isInstance(b) && isNetworkFirewall(a)) guarded.add(b.id);
    }
    return ctx.components
      .filter((c) => isInstance(c) && !guarded.has(c.id))
      .map((c) =>
        finding(SEC_005, 'medium', c.id, `${c.name} has no security group associated.`, {
          remediation: 'Associate a security group with the instance.',
        }),
      );
  },
};

const SEC_006: Rule = {
  id: 'SEC-006',
  title: 'IAM role grants access but no compute assumes it',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    // An IAM role's job is: a compute assumes it, and it grants a resource. A role that
    // grants a resource (an identity link to a non-compute) but is assumed by no compute
    // is a dangling grant — the access path is incomplete (doc: aws-relationship-model §8).
    const out: Finding[] = [];
    for (const role of ctx.components.filter(isPrincipal)) {
      const neighbours = ctx.connections
        .filter((cn) => cn.from === role.id || cn.to === role.id)
        .map((cn) => ctx.componentsById.get(cn.from === role.id ? cn.to : cn.from))
        .filter((c): c is Component => Boolean(c));
      const grantsResource = neighbours.some((n) => !isCompute(n));
      const assumedByCompute = neighbours.some(isCompute);
      if (grantsResource && !assumedByCompute) {
        out.push(
          finding(SEC_006, 'low', role.id, `${role.name} grants access to a resource but no compute assumes it.`, {
            remediation: 'Attach the role to the compute that needs it (EC2/Lambda/ECS), then draw the data path from that compute to the resource.',
          }),
        );
      }
    }
    return out;
  },
};

const OPS_002: Rule = {
  id: 'OPS-002',
  title: 'Resource is not attached to anything',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    const touched = new Set<string>();
    for (const cn of ctx.connections) {
      touched.add(cn.from);
      touched.add(cn.to);
    }
    return ctx.components
      .filter((c) => isAttachmentResource(c) && !touched.has(c.id))
      .map((c) =>
        finding(OPS_002, 'low', c.id, `${c.name} is not attached to anything.`, {
          remediation: 'Attach it to the resource it protects/serves (drop it onto that node), or remove it.',
        }),
      );
  },
};

const NET_001: Rule = {
  id: 'NET-001',
  title: 'Interface endpoint is not inside a subnet',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // An interface VPC endpoint provisions an ENI, so it must live in a subnet. (Gateway
    // endpoints — aws.vpc_gateway_endpoint — are route-table targets and are exempt.)
    return ctx.components
      .filter((c) => c.binding?.service === 'aws.privatelink' && !ctx.enclosingGroupOfKind(c.id, 'subnet'))
      .map((c) =>
        finding(NET_001, 'low', c.id, `${c.name} (interface endpoint) is not inside a subnet.`, {
          remediation: 'Place the interface endpoint in a subnet — it provisions an ENI there.',
        }),
      );
  },
};

const NET_002: Rule = {
  id: 'NET-002',
  title: 'Gateway endpoint is inside a subnet',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // A gateway endpoint is a route-table target with no ENI, so it belongs at the VPC
    // level, not in a subnet (the inverse of NET-001's interface-endpoint rule, Day 74).
    return ctx.components
      .filter((c) => c.binding?.service === 'aws.vpc_gateway_endpoint' && ctx.enclosingGroupOfKind(c.id, 'subnet'))
      .map((c) =>
        finding(NET_002, 'low', c.id, `${c.name} (gateway endpoint) is inside a subnet.`, {
          remediation: 'Move the gateway endpoint to the VPC level — it is a route-table target, not an ENI in a subnet.',
        }),
      );
  },
};

// ---- Placement / topology rules (Phase 3B follow-up — AWS hard constraints) ----
// These encode constructs AWS cannot build, surfaced after the fact for models committed
// before the canvas guards existed (the `test2` repro) or via the API/AI.

/** A VPC-external regional/global service that must NOT live inside a VPC/subnet. */
const isVpcExternalService = (c: Component): boolean =>
  c.type.startsWith('storage.object') ||
  c.type.startsWith('storage.archive') ||
  c.type === 'messaging.eventbus' ||
  c.type === 'messaging.topic' ||
  c.type === 'messaging.queue' ||
  c.type.startsWith('observability.') ||
  c.type.startsWith('network.dns') ||
  c.type.startsWith('network.cdn') ||
  c.type === 'database.keyvalue' ||
  c.type.startsWith('security.keys') ||
  c.type.startsWith('security.secrets') ||
  c.type.startsWith('security.identity') ||
  c.type.startsWith('integration.');

const NET_003: Rule = {
  id: 'NET-003',
  title: 'Invalid container nesting',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // AWS network containers cannot be arbitrarily nested: a VPC is top-level (optionally
    // grouped under a region), and a subnet lives directly in a VPC — never a VPC inside a
    // VPC/subnet, nor a subnet inside a subnet (doc: AWS placement rules).
    const out: Finding[] = [];
    for (const g of ctx.groups) {
      if (!g.parent) continue;
      const parent = ctx.groupsById.get(g.parent);
      if (!parent) continue;
      if (g.kind === 'network' && parent.kind !== 'region') {
        out.push(
          finding(NET_003, 'high', g.id, `${g.name} (VPC) is nested inside ${parent.name} (${parent.kind}); AWS does not support VPCs inside another VPC/subnet.`, {
            remediation: 'Make it a separate VPC and connect via VPC Peering, Transit Gateway, or PrivateLink.',
          }),
        );
      } else if (g.kind === 'subnet' && parent.kind === 'subnet') {
        out.push(
          finding(NET_003, 'high', g.id, `${g.name} (subnet) is nested inside subnet ${parent.name}; subnets cannot contain subnets.`, {
            remediation: 'Place the subnet directly in the VPC (or under an Availability Zone band).',
          }),
        );
      }
    }
    return out;
  },
};

const NET_004: Rule = {
  id: 'NET-004',
  title: 'Gateway is placed at the wrong level',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // IGW / VPN gateway attach at the VPC level (never inside a subnet); a Transit Gateway
    // lives outside the VPC entirely (it attaches to VPCs, it is not contained by one).
    const out: Finding[] = [];
    for (const c of ctx.components) {
      const inSubnet = ctx.enclosingGroupOfKind(c.id, 'subnet');
      const inVpc = ctx.enclosingGroupOfKind(c.id, 'network');
      if ((c.type.startsWith('network.gateway.internet') || c.type.startsWith('network.gateway.vpn')) && inSubnet) {
        out.push(
          finding(NET_004, 'high', c.id, `${c.name} is inside subnet "${inSubnet.name}"; an Internet/VPN gateway attaches at the VPC level, not inside a subnet.`, {
            remediation: 'Attach the gateway to the VPC; route a public subnet’s 0.0.0.0/0 to it.',
          }),
        );
      }
      if (c.type.startsWith('network.gateway.transit') && inVpc) {
        out.push(
          finding(NET_004, 'high', c.id, `${c.name} (Transit Gateway) is inside VPC "${inVpc.name}"; a Transit Gateway lives outside VPCs and attaches to them.`, {
            remediation: 'Move the Transit Gateway out of the VPC; connect VPCs to it as attachments.',
          }),
        );
      }
    }
    return out;
  },
};

const NET_005: Rule = {
  id: 'NET-005',
  title: 'NAT gateway is not in a public subnet',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // A NAT gateway provides outbound-only internet for private subnets and must itself sit
    // in a PUBLIC subnet (it needs a route to the IGW).
    const out: Finding[] = [];
    for (const c of ctx.components.filter((x) => x.type.startsWith('network.gateway.nat'))) {
      const subnet = ctx.enclosingGroupOfKind(c.id, 'subnet');
      if (!subnet) {
        out.push(finding(NET_005, 'high', c.id, `${c.name} (NAT gateway) is not inside a subnet; it must sit in a public subnet.`, { remediation: 'Place the NAT gateway in a public subnet.' }));
      } else if (subnet.properties?.public !== true) {
        out.push(finding(NET_005, 'high', c.id, `${c.name} (NAT gateway) is in private subnet "${subnet.name}"; a NAT gateway must sit in a public subnet.`, { remediation: 'Move the NAT gateway to a public subnet (one with a route to the Internet Gateway).' }));
      }
    }
    return out;
  },
};

const NET_006: Rule = {
  id: 'NET-006',
  title: 'Regional service placed inside a VPC',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    // S3 / EventBridge / CloudWatch / Route53 / DynamoDB / SNS / SQS / KMS / … are regional or
    // global services that are not inside a VPC; access from a VPC is via an endpoint or NAT.
    return ctx.components
      .filter((c) => isVpcExternalService(c) && ctx.enclosingGroupOfKind(c.id, 'network'))
      .map((c) => {
        const vpc = ctx.enclosingGroupOfKind(c.id, 'network')!;
        return finding(NET_006, 'high', c.id, `${c.name} is a regional/global service but is placed inside VPC "${vpc.name}".`, {
          remediation: 'Move it outside the VPC; reach it from the VPC via a VPC endpoint (interface/gateway) or NAT egress.',
        });
      });
  },
};

const SEC_007: Rule = {
  id: 'SEC-007',
  title: 'Security group attached to an unsupported resource',
  category: 'security',
  evaluate(ctx: RuleContext): Finding[] {
    // Security groups attach to ENIs (EC2/RDS/LB/interface endpoints) — never to regional
    // services (S3/EventBridge/CloudWatch/Route53) or a Transit Gateway.
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const cn of ctx.connections) {
      if (cn.kind !== 'dependency') continue;
      const a = ctx.componentsById.get(cn.from);
      const b = ctx.componentsById.get(cn.to);
      if (!a || !b) continue;
      const [sg, other] = isNetworkFirewall(a) ? [a, b] : isNetworkFirewall(b) ? [b, a] : [undefined, undefined];
      if (!sg || !other) continue;
      const unsupported = isVpcExternalService(other) || other.type.startsWith('network.gateway.transit');
      if (unsupported && !seen.has(`${sg.id}->${other.id}`)) {
        seen.add(`${sg.id}->${other.id}`);
        out.push(
          finding(SEC_007, 'medium', other.id, `Security group "${sg.name}" is associated with ${other.name}, which does not take a security group.`, {
            remediation: 'Remove the association; security groups attach to ENIs (EC2/RDS/load balancers/interface endpoints).',
          }),
        );
      }
    }
    return out;
  },
};

const OPS_001: Rule = {
  id: 'OPS-001',
  title: 'Critical component has no monitoring',
  category: 'operations',
  evaluate(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    for (const c of ctx.components) {
      if (c.criticality !== 'critical' && c.criticality !== 'high') continue;
      const m = c.operations?.monitoring;
      if (m && (m.metrics || m.logs || m.traces)) continue;
      // Severity modulated by criticality (doc 16 OPS-001 pattern): one rule, not three.
      out.push(
        finding(OPS_001, c.criticality === 'critical' ? 'high' : 'medium', c.id, `${c.name} is ${c.criticality}-criticality but has no monitoring configured.`, {
          remediation: 'Enable metrics/logs/traces under operations.monitoring.',
        }),
      );
    }
    return out;
  },
};

/**
 * ARC-001 — anti-pattern connection (Phase 3B / Day 103). A flow connection (traffic/data/
 * async) whose *source* service's curated `knowledge.antiPatterns` flags the *target*'s type
 * is a discouraged architecture: e.g. an event router or monitoring source wired straight to
 * storage, or an identity used as a data path. The catalog rejects most of these at draw-time,
 * but a model committed via the API/AI can still contain one — this is the server-side catch.
 *
 * Identity/peering/dependency edges are intentionally exempt (a role→resource *grant* edge is
 * correct modeling); only flow kinds are checked.
 */
const ARC_001_META = { id: 'ARC-001', title: 'Connection is a discouraged architecture pattern', category: 'operations' } as const;
const FLOW_KINDS = new Set<Connection['kind']>(['traffic', 'data', 'async']);
const typeSatisfies = (ruleType: string, type: string): boolean => type === ruleType || type.startsWith(`${ruleType}.`);

export function antiPatternRule(knowledgeByService: ReadonlyMap<string, ConnectionKnowledge>): Rule {
  return {
    ...ARC_001_META,
    evaluate(ctx: RuleContext): Finding[] {
      const out: Finding[] = [];
      for (const cn of ctx.connections) {
        if (!FLOW_KINDS.has(cn.kind)) continue;
        const src = ctx.componentsById.get(cn.from);
        const tgt = ctx.componentsById.get(cn.to);
        if (!src || !tgt) continue;
        const antiPatterns = src.binding?.service ? knowledgeByService.get(src.binding.service)?.antiPatterns : undefined;
        const match = antiPatterns?.find((ap) => typeSatisfies(ap.to, tgt.type));
        if (match) {
          out.push(
            finding(ARC_001_META, 'medium', cn.id, `${src.name} → ${tgt.name}: ${match.reason}`, {
              remediation: 'Route through the recommended intermediary (e.g. a function), or remove the direct connection.',
            }),
          );
        }
      }
      return out;
    },
  };
}

export const V1_PACK: readonly Rule[] = [SEC_001, SEC_002, SEC_004, SEC_005, SEC_006, SEC_007, REL_001, REL_007, OPS_001, OPS_002, NET_001, NET_002, NET_003, NET_004, NET_005, NET_006];
export { PACK_VERSION };
