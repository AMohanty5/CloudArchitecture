import { describe, expect, it } from 'vitest';
import { applyView } from './views';
import type { ProjectableModel } from './projector';

const model: ProjectableModel = {
  groups: [{ id: 'vpc', kind: 'network', name: 'VPC' }],
  components: [
    { id: 'lb', name: 'ALB', type: 'network.loadbalancer.l7', group: 'vpc' },
    { id: 'ec2', name: 'App', type: 'compute.vm', group: 'vpc' },
    { id: 'rds', name: 'DB', type: 'database.relational', group: 'vpc' },
    { id: 'sg', name: 'SG', type: 'network.firewall.network' },
    { id: 'cw', name: 'Metrics', type: 'observability.metrics' },
  ],
  connections: [
    { id: 'lb-ec2', from: 'lb', to: 'ec2', kind: 'traffic' },
    { id: 'ec2-rds', from: 'ec2', to: 'rds', kind: 'data' },
    { id: 'sg-ec2', from: 'sg', to: 'ec2', kind: 'dependency' },
    { id: 'cw-ec2', from: 'cw', to: 'ec2', kind: 'dependency' },
  ],
};
const ids = (m: ProjectableModel) => (m.components ?? []).map((c) => c.id).sort();

describe('applyView', () => {
  it('resource view is the identity', () => {
    expect(applyView(model, 'resource')).toBe(model);
  });

  it('architecture view drops security + observability detail', () => {
    const v = applyView(model, 'architecture');
    expect(ids(v)).toEqual(['ec2', 'lb', 'rds']); // sg + cw gone
    expect((v.connections ?? []).map((c) => c.id).sort()).toEqual(['ec2-rds', 'lb-ec2']); // pruned
  });

  it('network view keeps networking constructs + SG/NACL, drops compute/data', () => {
    const v = applyView(model, 'network');
    expect(ids(v)).toEqual(['lb', 'sg']); // edge LB + SG; ec2/rds/cw gone
  });

  it('executive view aggregates to Users → Application → Data Platform', () => {
    const v = applyView(model, 'executive');
    expect(ids(v)).toEqual(['__exec-app', '__exec-data', '__exec-users']);
    expect(v.groups ?? []).toEqual([]); // infra hidden
    const conns = (v.connections ?? []).map((c) => `${c.from}->${c.to}`).sort();
    expect(conns).toEqual(['__exec-app->__exec-data', '__exec-users->__exec-app']);
  });
});
