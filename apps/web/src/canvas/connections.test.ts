import { describe, expect, it } from 'vitest';
import { evaluateConnection, edgeStyle, groupEndpointType, makeConnectionId } from './connections';
import type { ConnectionRules } from '../lib/queries';

const albRules: ConnectionRules = {
  inbound: [{ kinds: ['traffic'], protocols: ['http', 'https'], from: ['network.cdn', 'network.gateway.api', 'external'] }],
  outbound: [{ kinds: ['traffic'], protocols: ['http', 'https'], to: ['compute.vm.autoscaling_group', 'compute.serverless.function'] }],
};
const asgRules: ConnectionRules = {
  inbound: [{ kinds: ['traffic'], from: ['network.loadbalancer.l7', 'network.loadbalancer.l4'] }],
  outbound: [{ kinds: ['data'], to: ['database.relational', 'database.cache', 'storage.object'] }],
};
const rdsRules: ConnectionRules = {
  inbound: [{ kinds: ['data'], protocols: ['postgres', 'mysql'], from: ['compute.vm.autoscaling_group'] }],
  outbound: [{ kinds: ['replication'], to: ['database.relational'] }],
};

const alb = { type: 'network.loadbalancer.l7', rules: albRules };
const asg = { type: 'compute.vm.autoscaling_group', rules: asgRules };
const rds = { type: 'database.relational', rules: rdsRules };

describe('evaluateConnection', () => {
  it('allows ALB → ASG as traffic (smart default)', () => {
    const v = evaluateConnection(alb, asg);
    expect(v.allowed).toBe(true);
    expect(v.kinds[0]).toBe('traffic');
    expect(v.protocols).toContain('https');
  });

  it('allows ASG → RDS as data', () => {
    const v = evaluateConnection(asg, rds);
    expect(v.allowed).toBe(true);
    expect(v.kinds[0]).toBe('data');
    expect(v.protocols).toContain('postgres');
  });

  it('rejects ALB → RDS with an explanation', () => {
    const v = evaluateConnection(alb, rds);
    expect(v.allowed).toBe(false);
    expect(v.kinds).toEqual([]);
    expect(v.reason).toMatch(/cannot connect/);
  });

  it('rejects reverse traffic (ASG → ALB)', () => {
    expect(evaluateConnection(asg, alb).allowed).toBe(false);
  });

  it('treats missing rules as no permission', () => {
    expect(evaluateConnection({ type: 'a' }, { type: 'b' }).allowed).toBe(false);
  });
});

describe('evaluateConnection — subtype matching', () => {
  // A rule targeting the parent type `compute.vm` should also accept the ASG subtype.
  const ebsRules: ConnectionRules = { inbound: [{ kinds: ['dependency'], from: ['compute.vm'] }] };
  const ec2 = { type: 'compute.vm' };
  const asg = { type: 'compute.vm.autoscaling_group' };
  const ebs = { type: 'storage.block', rules: ebsRules };

  it('matches a subtype against a parent-type rule (ASG → EBS)', () => {
    const v = evaluateConnection(asg, ebs);
    expect(v.allowed).toBe(true);
    expect(v.kinds[0]).toBe('dependency');
  });

  it('still matches the exact parent type (EC2 → EBS)', () => {
    expect(evaluateConnection(ec2, ebs).allowed).toBe(true);
  });

  it('does not match a parent type against a subtype-only rule', () => {
    const onlyAsg: ConnectionRules = { inbound: [{ kinds: ['dependency'], from: ['compute.vm.autoscaling_group'] }] };
    expect(evaluateConnection(ec2, { type: 'storage.block', rules: onlyAsg }).allowed).toBe(false);
  });
});

describe('evaluateConnection — undirected structural relationships', () => {
  // EBS only declares an inbound dependency from compute; EC2 has no storage rule.
  const ebs = { type: 'storage.block', rules: { inbound: [{ kinds: ['dependency'], from: ['compute.vm'] }] } as ConnectionRules };
  const ec2 = { type: 'compute.vm', rules: { inbound: [{ kinds: ['traffic'], from: ['network.loadbalancer.l7'] }] } as ConnectionRules };
  // SG only declares an outbound dependency to compute.
  const sg = { type: 'network.firewall.network', rules: { outbound: [{ kinds: ['dependency'], to: ['compute.vm'] }] } as ConnectionRules };

  it('allows EBS → EC2 by flipping to the canonical EC2 → EBS dependency', () => {
    const v = evaluateConnection(ebs, ec2);
    expect(v.allowed).toBe(true);
    expect(v.kinds).toEqual(['dependency']);
    expect(v.flip).toBe(true);
  });

  it('allows the forward EC2 → EBS without flipping', () => {
    const v = evaluateConnection(ec2, ebs);
    expect(v.allowed).toBe(true);
    expect(v.flip).toBeUndefined();
  });

  it('allows EC2 → SG by flipping to the canonical SG → EC2 dependency', () => {
    const v = evaluateConnection(ec2, sg);
    expect(v.allowed).toBe(true);
    expect(v.kinds).toEqual(['dependency']);
    expect(v.flip).toBe(true);
  });

  it('does not flip directional flow kinds (ASG → ALB stays rejected)', () => {
    expect(evaluateConnection(asg, alb).allowed).toBe(false);
  });
});

describe('evaluateConnection — group endpoints (VPC peering ↔ VPC)', () => {
  // aws.vpc_peering targets the network group; a VPC group carries no rules of its own.
  const peering = {
    type: 'network.link.peering',
    rules: { outbound: [{ kinds: ['peering'], to: ['group.network'] }] } as ConnectionRules,
  };
  const vpc = { type: groupEndpointType('network') }; // group endpoint, no rules

  it('allows VPC-peering → VPC as peering (forward)', () => {
    const v = evaluateConnection(peering, vpc);
    expect(v.allowed).toBe(true);
    expect(v.kinds).toEqual(['peering']);
    expect(v.flip).toBeUndefined();
  });

  it('allows VPC → VPC-peering by flipping (undirected)', () => {
    const v = evaluateConnection(vpc, peering);
    expect(v.allowed).toBe(true);
    expect(v.kinds).toEqual(['peering']);
    expect(v.flip).toBe(true);
  });

  it('rejects a group endpoint with no matching rule', () => {
    expect(evaluateConnection(vpc, { type: groupEndpointType('subnet') }).allowed).toBe(false);
  });
});

describe('groupEndpointType', () => {
  it('namespaces a group kind so it cannot collide with abstract types', () => {
    expect(groupEndpointType('network')).toBe('group.network');
  });
});

describe('edgeStyle', () => {
  it('styles known kinds and falls back for unknown', () => {
    expect(edgeStyle('traffic').strokeDasharray).toBeUndefined();
    expect(edgeStyle('data').strokeDasharray).toBeDefined();
    expect(edgeStyle('mystery').stroke).toBe('#94a3b8');
  });
});

describe('makeConnectionId', () => {
  it('is CAML-id-shaped', () => {
    expect(makeConnectionId()).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });
});
