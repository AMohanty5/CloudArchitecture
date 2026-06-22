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
  it('fires when storageEncrypted is explicitly false, with a one-click fix', () => {
    const findings = validateModel(doc({ components: [db({ properties: { storageEncrypted: false } })] })).findings;
    const sec001 = findings.find((f) => f.ruleId === 'SEC-001');
    expect(sec001).toBeDefined();
    expect(sec001!.autoFixable).toBe(true);
    expect(sec001!.fix).toEqual({ kind: 'setProperty', key: 'storageEncrypted', value: true });
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

describe('validateModel — SEC-005 instance without a security group', () => {
  const ec2 = (over: Partial<Component> = {}): Component => ({ id: 'app', type: 'compute.vm', name: 'App', ...over });
  const sg: Component = {
    id: 'sg',
    type: 'network.firewall.network',
    name: 'SG',
    binding: { provider: 'aws', service: 'aws.security_group' },
  };

  it('fires for an instance with no security-group association', () => {
    expect(ids(doc({ components: [ec2()] }))).toContain('SEC-005:app');
  });

  it('does not fire when a security group is associated, in either edge direction', () => {
    const sgToApp = doc({ components: [ec2(), sg], connections: [{ id: 'c1', from: 'sg', to: 'app', kind: 'dependency' }] });
    const appToSg = doc({ components: [ec2(), sg], connections: [{ id: 'c1', from: 'app', to: 'sg', kind: 'dependency' }] });
    expect(ids(sgToApp)).not.toContain('SEC-005:app');
    expect(ids(appToSg)).not.toContain('SEC-005:app');
  });

  it('covers autoscaling groups (compute.vm subtree) as well', () => {
    const m = doc({ components: [ec2({ id: 'asg', type: 'compute.vm.autoscaling_group', name: 'ASG' })] });
    expect(ids(m)).toContain('SEC-005:asg');
  });
});

describe('validateModel — SEC-006 dangling IAM grant', () => {
  const role: Component = { id: 'role', type: 'security.identity.principal', name: 'AppRole', binding: { provider: 'aws', service: 'aws.iam_role' } };
  const s3: Component = { id: 's3', type: 'storage.object', name: 'Bucket' };
  const ec2: Component = { id: 'ec2', type: 'compute.vm', name: 'App' };

  it('fires when a role grants a resource but no compute assumes it', () => {
    const m = doc({ components: [role, s3], connections: [{ id: 'g', from: 'role', to: 's3', kind: 'identity' }] });
    expect(ids(m)).toContain('SEC-006:role');
  });
  it('does not fire when a compute assumes the role', () => {
    const m = doc({
      components: [role, s3, ec2],
      connections: [
        { id: 'g', from: 'role', to: 's3', kind: 'identity' },
        { id: 'a', from: 'role', to: 'ec2', kind: 'identity' },
      ],
    });
    expect(ids(m)).not.toContain('SEC-006:role');
  });
});

describe('validateModel — OPS-002 unattached resource', () => {
  const ebs = (over: Partial<Component> = {}): Component => ({ id: 'ebs', type: 'storage.block', name: 'Vol', binding: { provider: 'aws', service: 'aws.ebs' }, ...over });
  const ec2: Component = { id: 'ec2', type: 'compute.vm', name: 'App' };
  it('fires for a free-floating EBS/SG/role', () => {
    expect(ids(doc({ components: [ebs()] }))).toContain('OPS-002:ebs');
  });
  it('does not fire once it is attached', () => {
    const m = doc({ components: [ebs(), ec2], connections: [{ id: 'c', from: 'ec2', to: 'ebs', kind: 'dependency' }] });
    expect(ids(m)).not.toContain('OPS-002:ebs');
  });
});

describe('validateModel — NET-001 interface endpoint outside a subnet', () => {
  const ep = (group?: string): Component => ({ id: 'ep', type: 'network.endpoint.private', name: 'IF endpoint', binding: { provider: 'aws', service: 'aws.privatelink' }, ...(group ? { group } : {}) });
  it('fires when an interface endpoint is not in a subnet', () => {
    expect(ids(doc({ components: [ep()] }))).toContain('NET-001:ep');
  });
  it('does not fire inside a subnet', () => {
    const m = doc({ groups: [{ id: 'sub', kind: 'subnet', name: 'Sub' }], components: [ep('sub')] });
    expect(ids(m)).not.toContain('NET-001:ep');
  });
});

describe('validateModel — NET-002 gateway endpoint placement', () => {
  const gw = (group?: string): Component => ({ id: 'gw', type: 'network.endpoint.private', name: 'S3 gateway', binding: { provider: 'aws', service: 'aws.vpc_gateway_endpoint' }, ...(group ? { group } : {}) });
  it('fires when a gateway endpoint sits inside a subnet', () => {
    const m = doc({ groups: [{ id: 'sub', kind: 'subnet', name: 'Sub' }], components: [gw('sub')] });
    expect(ids(m)).toContain('NET-002:gw');
  });
  it('does not fire at the VPC level (or top level)', () => {
    const m = doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }], components: [gw('vpc')] });
    expect(ids(m)).not.toContain('NET-002:gw');
    expect(ids(doc({ components: [gw()] }))).not.toContain('NET-002:gw');
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

describe('validateModel — ARC-001 anti-pattern connection (Phase 3B)', () => {
  const eb: Component = { id: 'eb', type: 'messaging.eventbus', name: 'Bus', binding: { provider: 'aws', service: 'aws.eventbridge' } };
  const s3: Component = { id: 's3', type: 'storage.object', name: 'Bucket', binding: { provider: 'aws', service: 'aws.s3' } };
  const knowledge = new Map([
    ['aws.eventbridge', { antiPatterns: [{ to: 'storage.object', reason: "Event routers don't write to storage directly." }] }],
  ]);
  const ebToS3 = (kind: 'async' | 'identity') => doc({ components: [eb, s3], connections: [{ id: 'c', from: 'eb', to: 's3', kind }] });

  it('fires on a flow connection the source service flags as an anti-pattern', () => {
    const findings = validateModel(ebToS3('async'), knowledge).findings;
    const arc = findings.find((f) => f.ruleId === 'ARC-001');
    expect(arc).toMatchObject({ targetId: 'c', severity: 'medium' });
    expect(arc!.message).toContain("don't write to storage");
  });

  it('does not fire without the knowledge map (back-compat), nor on non-flow kinds', () => {
    expect(validateModel(ebToS3('async')).findings.some((f) => f.ruleId === 'ARC-001')).toBe(false);
    expect(validateModel(ebToS3('identity'), knowledge).findings.some((f) => f.ruleId === 'ARC-001')).toBe(false);
  });
});

describe('validateModel — NET-003 invalid container nesting', () => {
  const g = (id: string, kind: string, parent?: string) => ({ id, kind, name: id, ...(parent ? { parent } : {}) });
  it('flags a VPC nested in another VPC, and a subnet inside a subnet', () => {
    const m = doc({ components: [], groups: [g('vpc', 'network'), g('vpc2', 'network', 'vpc'), g('sub', 'subnet', 'vpc'), g('sub2', 'subnet', 'sub')] });
    const out = ids(m);
    expect(out).toContain('NET-003:vpc2');
    expect(out).toContain('NET-003:sub2');
    expect(out).not.toContain('NET-003:sub');
  });
  it('does not flag a VPC under a region or a subnet under a VPC', () => {
    const m = doc({ components: [], groups: [g('reg', 'region'), g('vpc', 'network', 'reg'), g('sub', 'subnet', 'vpc')] });
    expect(ids(m).some((x) => x.startsWith('NET-003'))).toBe(false);
  });
});

describe('validateModel — NET-004/005 gateway placement', () => {
  const comp = (id: string, type: string, group?: string): Component => ({ id, type, name: id, ...(group ? { group } : {}) });
  const subnet = (id: string, isPublic: boolean) => ({ id, kind: 'subnet', name: id, properties: { public: isPublic } });
  it('flags an Internet Gateway inside a subnet (NET-004)', () => {
    const m = doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }, { id: 'sub', kind: 'subnet', name: 'Sub', parent: 'vpc' }], components: [comp('igw', 'network.gateway.internet', 'sub')] });
    expect(ids(m)).toContain('NET-004:igw');
  });
  it('flags a Transit Gateway inside a VPC (NET-004)', () => {
    const m = doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }], components: [comp('tgw', 'network.gateway.transit', 'vpc')] });
    expect(ids(m)).toContain('NET-004:tgw');
  });
  it('flags a NAT gateway in a private subnet but not in a public one (NET-005)', () => {
    const priv = doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }, subnet('sub', false)], components: [comp('nat', 'network.gateway.nat', 'sub')] });
    const pub = doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }, subnet('sub', true)], components: [comp('nat', 'network.gateway.nat', 'sub')] });
    expect(ids(priv)).toContain('NET-005:nat');
    expect(ids(pub)).not.toContain('NET-005:nat');
  });
});

describe('validateModel — NET-006 regional service inside a VPC', () => {
  const inVpc = (type: string): CamlDocument =>
    doc({ groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }, { id: 'sub', kind: 'subnet', name: 'Sub', parent: 'vpc' }], components: [{ id: 'x', type, name: 'X', group: 'sub' }] });
  it('flags S3 / EventBridge / DynamoDB placed inside a VPC', () => {
    expect(ids(inVpc('storage.object'))).toContain('NET-006:x');
    expect(ids(inVpc('messaging.eventbus'))).toContain('NET-006:x');
    expect(ids(inVpc('database.keyvalue'))).toContain('NET-006:x');
  });
  it('does not flag in-VPC services (RDS, ElastiCache, ALB)', () => {
    expect(ids(inVpc('database.relational'))).not.toContain('NET-006:x');
    expect(ids(inVpc('database.cache'))).not.toContain('NET-006:x');
    expect(ids(inVpc('network.loadbalancer.l7'))).not.toContain('NET-006:x');
  });
  it('does not flag a regional service grouped under a region (not a VPC)', () => {
    const m = doc({ groups: [{ id: 'reg', kind: 'region', name: 'us-east-1' }], components: [{ id: 'x', type: 'storage.object', name: 'S3', group: 'reg' }] });
    expect(ids(m)).not.toContain('NET-006:x');
  });
});

describe('validateModel — SEC-007 security group on an unsupported target', () => {
  const sg: Component = { id: 'sg', type: 'network.firewall.network', name: 'SG', binding: { provider: 'aws', service: 'aws.security_group' } };
  it('flags a security group associated with S3 / EventBridge', () => {
    const s3 = doc({ components: [sg, { id: 's3', type: 'storage.object', name: 'Bucket' }], connections: [{ id: 'c', from: 'sg', to: 's3', kind: 'dependency' }] });
    expect(ids(s3)).toContain('SEC-007:s3');
  });
  it('does not flag a security group on an EC2 instance', () => {
    const ec2 = doc({ components: [sg, { id: 'ec2', type: 'compute.vm', name: 'App' }], connections: [{ id: 'c', from: 'sg', to: 'ec2', kind: 'dependency' }] });
    expect(ids(ec2)).not.toContain('SEC-007:ec2');
  });
});

describe('validateModel — test2 governance repro (all placement rules together)', () => {
  // A faithful slice of the reported `test2`: nested VPC, IGW in a private subnet, RDS VPC,
  // S3 dropped into a VPC, and a security group wired to S3.
  const model = doc({
    groups: [
      { id: 'vpc-a', kind: 'network', name: 'VPC A' },
      { id: 'sub-app', kind: 'subnet', name: 'App', parent: 'vpc-a', properties: { public: false } },
      { id: 'vpc-b', kind: 'network', name: 'VPC B' },
      { id: 'vpc-nested', kind: 'network', name: 'Nested VPC', parent: 'vpc-b' }, // F1
      { id: 'sub-igw', kind: 'subnet', name: 'IGW subnet', parent: 'vpc-b', properties: { public: false } },
    ],
    components: [
      { id: 'ec2', type: 'compute.vm', name: 'EC2', group: 'sub-app' },
      { id: 'igw', type: 'network.gateway.internet', name: 'Internet Gateway', group: 'sub-igw' }, // F2
      { id: 's3', type: 'storage.object', name: 'S3', group: 'sub-app' }, // F (regional in VPC)
      { id: 'sg', type: 'network.firewall.network', name: 'Security Group', binding: { provider: 'aws', service: 'aws.security_group' } },
    ],
    connections: [{ id: 'sg-s3', from: 'sg', to: 's3', kind: 'dependency' }], // SG on S3
  });
  it('surfaces every placement violation', () => {
    const out = ids(model);
    expect(out).toContain('NET-003:vpc-nested'); // nested VPC
    expect(out).toContain('NET-004:igw'); // IGW in a subnet
    expect(out).toContain('NET-006:s3'); // S3 inside a VPC
    expect(out).toContain('SEC-007:s3'); // SG attached to S3
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
