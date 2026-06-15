import { describe, expect, it } from 'vitest';
import { validateModel } from './validate';
import type { CamlDocument, Component } from '@cac/caml';

/** A minimal valid doc; tests layer components/groups/etc. on top. */
function doc(over: Partial<CamlDocument>): CamlDocument {
  return { camlVersion: '1.0', id: 'arch_T', name: 'T', components: [], ...over };
}
const ids = (model: CamlDocument): string[] => validateModel(model).findings.map((f) => `${f.ruleId}:${f.targetId}`);

const db = (over: Partial<Component> = {}): Component => ({
  id: 'db',
  type: 'database.relational',
  name: 'DB',
  binding: { provider: 'aws', service: 'aws.rds' },
  ...over,
});

describe('validateModel — SEC-001 unencrypted datastore', () => {
  it('fires when storageEncrypted is explicitly false', () => {
    expect(ids(doc({ components: [db({ properties: { storageEncrypted: false } })] }))).toContain('SEC-001:db');
  });
  it('does not fire when encrypted, or when the flag is absent (no guessing)', () => {
    expect(ids(doc({ components: [db({ properties: { storageEncrypted: true } })] }))).not.toContain('SEC-001:db');
    expect(ids(doc({ components: [db({})] }))).not.toContain('SEC-001:db');
  });
});

describe('validateModel — SEC-004 datastore in a public subnet', () => {
  const base = (publicSubnet: boolean) =>
    doc({
      groups: [{ id: 'sub', kind: 'subnet', name: 'Sub', properties: { public: publicSubnet } }],
      components: [db({ group: 'sub' })],
    });
  it('fires for a datastore in a public subnet', () => {
    expect(ids(base(true))).toContain('SEC-004:db');
  });
  it('does not fire in a private subnet', () => {
    expect(ids(base(false))).not.toContain('SEC-004:db');
  });
});

describe('validateModel — SEC-002 internet-reachable database', () => {
  const lb: Component = { id: 'lb', type: 'network.loadbalancer.l7', name: 'LB', properties: { scheme: 'internet-facing' } };
  const app: Component = { id: 'app', type: 'compute.vm', name: 'App' };

  it('fires when an internet-facing LB reaches a DB through the app tier with no WAF', () => {
    const model = doc({
      components: [lb, app, db()],
      connections: [
        { id: 'c1', from: 'lb', to: 'app', kind: 'traffic' },
        { id: 'c2', from: 'app', to: 'db', kind: 'data' },
      ],
    });
    expect(ids(model)).toContain('SEC-002:db');
  });

  it('does not fire when a WAF sits in the path', () => {
    const waf: Component = { id: 'waf', type: 'network.firewall.waf', name: 'WAF' };
    const model = doc({
      components: [lb, waf, app, db()],
      connections: [
        { id: 'c1', from: 'lb', to: 'waf', kind: 'traffic' },
        { id: 'c2', from: 'waf', to: 'app', kind: 'traffic' },
        { id: 'c3', from: 'app', to: 'db', kind: 'data' },
      ],
    });
    expect(ids(model)).not.toContain('SEC-002:db');
  });

  it('does not fire for an internal load balancer', () => {
    const model = doc({
      components: [{ ...lb, properties: { scheme: 'internal' } }, db()],
      connections: [{ id: 'c1', from: 'lb', to: 'db', kind: 'data' }],
    });
    expect(ids(model)).not.toContain('SEC-002:db');
  });
});

describe('validateModel — REL-001 stateful single-AZ under an availability requirement', () => {
  const withReq = (multiAz?: boolean) =>
    doc({
      requirements: [{ id: 'r', kind: 'availability', statement: 'HA' }],
      components: [db({ properties: multiAz === undefined ? {} : { multiAz } })],
    });
  it('fires when a DB is not multi-AZ and an availability requirement exists', () => {
    expect(ids(withReq(false))).toContain('REL-001:db');
    expect(ids(withReq(undefined))).toContain('REL-001:db');
  });
  it('does not fire when multi-AZ, or when no availability requirement exists', () => {
    expect(ids(withReq(true))).not.toContain('REL-001:db');
    expect(ids(doc({ components: [db({ properties: {} })] }))).not.toContain('REL-001:db');
  });
});

describe('validateModel — REL-007 pinned autoscaling', () => {
  const asg = (min?: number, max?: number): Component => ({
    id: 'asg',
    type: 'compute.vm.autoscaling_group',
    name: 'ASG',
    scaling: { min, max },
  });
  it('fires when min == max', () => {
    expect(ids(doc({ components: [asg(2, 2)] }))).toContain('REL-007:asg');
  });
  it('does not fire when min < max', () => {
    expect(ids(doc({ components: [asg(2, 6)] }))).not.toContain('REL-007:asg');
  });
});

describe('validateModel — OPS-001 monitoring gap (severity modulated)', () => {
  const comp = (criticality: Component['criticality'], monitored: boolean): Component => ({
    id: 'c',
    type: 'compute.vm',
    name: 'C',
    criticality,
    operations: monitored ? { monitoring: { metrics: true } } : undefined,
  });
  it('fires high for critical, medium for high-criticality', () => {
    expect(validateModel(doc({ components: [comp('critical', false)] })).findings[0]!.severity).toBe('high');
    expect(validateModel(doc({ components: [comp('high', false)] })).findings[0]!.severity).toBe('medium');
  });
  it('does not fire when monitored, or for low criticality', () => {
    expect(ids(doc({ components: [comp('critical', true)] }))).not.toContain('OPS-001:c');
    expect(ids(doc({ components: [comp('low', false)] }))).not.toContain('OPS-001:c');
  });
});

describe('validateModel — report shape', () => {
  const model = doc({
    requirements: [{ id: 'r', kind: 'availability', statement: 'HA' }],
    components: [db({ properties: { storageEncrypted: false } })],
  });
  const report = validateModel(model);

  it('summarises counts by severity and sorts findings by severity', () => {
    expect(report.summary.total).toBe(2); // SEC-001 (critical) + REL-001 (high)
    expect(report.summary.bySeverity.critical).toBe(1);
    expect(report.summary.bySeverity.high).toBe(1);
    expect(report.findings.map((f) => f.severity)).toEqual(['critical', 'high']);
    expect(report.packVersion).toBe('pack/dev');
  });

  it('is deterministic and clean for a healthy model', () => {
    expect(validateModel(model)).toEqual(report);
    expect(validateModel(doc({ components: [db({ properties: { storageEncrypted: true } })] })).summary.total).toBe(0);
  });
});
