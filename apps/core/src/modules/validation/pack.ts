import type { Component } from '@cac/caml';
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

export const V1_PACK: readonly Rule[] = [SEC_001, SEC_002, SEC_004, REL_001, REL_007, OPS_001];
export { PACK_VERSION };
