import { describe, expect, it } from 'vitest';
import { evaluateConnection, edgeStyle, makeConnectionId } from './connections';
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
