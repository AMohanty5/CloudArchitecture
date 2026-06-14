import { describe, expect, it } from 'vitest';
import { applyCommand, componentFromService, groupFromService, makeComponentId } from './commands';
import type { EditableModel } from './commands';

const base: EditableModel = { camlVersion: '1.0', id: 'arch_X', name: 'X', components: [] };
const alb = { key: 'aws.alb', name: 'Application Load Balancer', provider: 'aws', abstractTypes: ['network.loadbalancer.l7'] };

describe('commands', () => {
  it('componentFromService builds a bound component', () => {
    expect(componentFromService(alb, 'alb-1')).toEqual({
      id: 'alb-1',
      type: 'network.loadbalancer.l7',
      name: 'Application Load Balancer',
      binding: { provider: 'aws', service: 'aws.alb' },
    });
  });

  it('componentFromService returns null for group-kind services', () => {
    expect(componentFromService({ key: 'aws.vpc', name: 'VPC', provider: 'aws', groupKind: 'network' }, 'vpc-1')).toBeNull();
  });

  it('makeComponentId is CAML-id-shaped', () => {
    expect(makeComponentId('aws.alb')).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
    expect(makeComponentId('aws.ec2_asg')).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });

  it('applyCommand AddComponent appends without mutating the input', () => {
    const component = componentFromService(alb, 'alb-1')!;
    const next = applyCommand(base, { type: 'AddComponent', component });
    expect(next.components).toHaveLength(1);
    expect(base.components).toHaveLength(0); // input untouched
    expect(next.id).toBe('arch_X'); // passthrough fields preserved
  });

  const withRds: EditableModel = {
    ...base,
    components: [{ id: 'db-1', type: 'database.relational', name: 'DB', binding: { provider: 'aws', service: 'aws.rds' } }],
  };

  it('applyCommand SetProperty sets a value without mutating the input', () => {
    const next = applyCommand(withRds, { type: 'SetProperty', componentId: 'db-1', key: 'multiAz', value: true });
    expect(next.components![0]!.properties).toEqual({ multiAz: true });
    expect(withRds.components![0]!.properties).toBeUndefined(); // input untouched
  });

  it('applyCommand SetProperty with undefined clears the key (and drops empty properties)', () => {
    const set = applyCommand(withRds, { type: 'SetProperty', componentId: 'db-1', key: 'multiAz', value: true });
    const cleared = applyCommand(set, { type: 'SetProperty', componentId: 'db-1', key: 'multiAz', value: undefined });
    expect(cleared.components![0]!.properties).toBeUndefined();
  });

  it('applyCommand SetProperty is a no-op for an unknown component', () => {
    const next = applyCommand(withRds, { type: 'SetProperty', componentId: 'nope', key: 'multiAz', value: true });
    expect(next.components![0]!.properties).toBeUndefined();
  });

  it('applyCommand Rename changes only the name', () => {
    const next = applyCommand(withRds, { type: 'Rename', componentId: 'db-1', name: 'Orders DB' });
    expect(next.components![0]!.name).toBe('Orders DB');
    expect(withRds.components![0]!.name).toBe('DB'); // input untouched
  });

  const conn = { id: 'conn-1', from: 'alb-1', to: 'asg-1', kind: 'traffic' };

  it('applyCommand Connect appends a connection without mutating the input', () => {
    const next = applyCommand(base, { type: 'Connect', connection: conn });
    expect(next.connections).toEqual([conn]);
    expect(base.connections).toBeUndefined(); // input untouched
  });

  it('applyCommand Disconnect removes the connection by id', () => {
    const connected = applyCommand(base, { type: 'Connect', connection: conn });
    const next = applyCommand(connected, { type: 'Disconnect', connectionId: 'conn-1' });
    expect(next.connections).toEqual([]);
  });

  it('applyCommand SetConnectionKind changes the kind', () => {
    const connected = applyCommand(base, { type: 'Connect', connection: conn });
    const next = applyCommand(connected, { type: 'SetConnectionKind', connectionId: 'conn-1', kind: 'data' });
    expect(next.connections![0]!.kind).toBe('data');
  });

  it('applyCommand SetConnectionProperty sets and clears connection properties', () => {
    const connected = applyCommand(base, { type: 'Connect', connection: conn });
    const set = applyCommand(connected, { type: 'SetConnectionProperty', connectionId: 'conn-1', key: 'port', value: 443 });
    expect(set.connections![0]!.properties).toEqual({ port: 443 });
    const cleared = applyCommand(set, { type: 'SetConnectionProperty', connectionId: 'conn-1', key: 'port', value: undefined });
    expect(cleared.connections![0]!.properties).toBeUndefined();
  });

  // ---- Day 16: groups & containment ----
  const vpcSvc = { key: 'aws.vpc', name: 'Amazon VPC', provider: 'aws', groupKind: 'network' };

  it('groupFromService builds a provider-bound group of the service groupKind', () => {
    expect(groupFromService(vpcSvc, 'vpc-1')).toEqual({ id: 'vpc-1', kind: 'network', name: 'Amazon VPC', provider: 'aws' });
    expect(groupFromService(vpcSvc, 'sub-1', 'vpc-1')).toMatchObject({ parent: 'vpc-1' });
  });

  it('groupFromService returns null for component services', () => {
    expect(groupFromService(alb, 'g-1')).toBeNull();
  });

  it('applyCommand AddGroup appends a group without mutating the input', () => {
    const g = groupFromService(vpcSvc, 'vpc-1')!;
    const next = applyCommand(base, { type: 'AddGroup', group: g });
    expect(next.groups).toEqual([g]);
    expect(base.groups).toBeUndefined();
  });

  it('applyCommand MoveToGroup sets the component group, and undefined moves it to top level', () => {
    const moved = applyCommand(withRds, { type: 'MoveToGroup', componentId: 'db-1', group: 'sub-1' });
    expect(moved.components![0]!.group).toBe('sub-1');
    const out = applyCommand(moved, { type: 'MoveToGroup', componentId: 'db-1', group: undefined });
    expect(out.components![0]!.group).toBeUndefined();
    expect('group' in out.components![0]!).toBe(false); // key removed, not left as undefined
  });

  it('applyCommand MoveGroup re-parents a group; undefined makes it top level', () => {
    const m = applyCommand(base, { type: 'AddGroup', group: groupFromService(vpcSvc, 'vpc-1')! });
    const m2 = applyCommand(m, { type: 'AddGroup', group: groupFromService({ ...vpcSvc, groupKind: 'subnet', name: 'Subnet' }, 'sub-1')! });
    const nested = applyCommand(m2, { type: 'MoveGroup', groupId: 'sub-1', parent: 'vpc-1' });
    expect(nested.groups!.find((g) => g.id === 'sub-1')!.parent).toBe('vpc-1');
    const top = applyCommand(nested, { type: 'MoveGroup', groupId: 'sub-1', parent: undefined });
    expect(top.groups!.find((g) => g.id === 'sub-1')!.parent).toBeUndefined();
  });

  it('applyCommand RenameGroup and SetGroupProperty edit a group', () => {
    const m = applyCommand(base, { type: 'AddGroup', group: groupFromService(vpcSvc, 'vpc-1')! });
    const renamed = applyCommand(m, { type: 'RenameGroup', groupId: 'vpc-1', name: 'Prod VPC' });
    expect(renamed.groups![0]!.name).toBe('Prod VPC');
    const prop = applyCommand(renamed, { type: 'SetGroupProperty', groupId: 'vpc-1', key: 'cidr', value: '10.0.0.0/16' });
    expect(prop.groups![0]!.properties).toEqual({ cidr: '10.0.0.0/16' });
  });

  it('applyCommand RemoveComponent prunes the component and any connection touching it', () => {
    const withConn: EditableModel = {
      ...base,
      components: [
        { id: 'a', type: 'network.loadbalancer.l7', name: 'A' },
        { id: 'b', type: 'compute.vm.autoscaling_group', name: 'B' },
      ],
      connections: [{ id: 'c-1', from: 'a', to: 'b', kind: 'traffic' }],
    };
    const next = applyCommand(withConn, { type: 'RemoveComponent', componentId: 'a' });
    expect(next.components!.map((c) => c.id)).toEqual(['b']);
    expect(next.connections).toEqual([]); // dangling connection pruned
  });

  it('applyCommand RemoveGroup orphans direct children to the top level', () => {
    const m: EditableModel = {
      ...base,
      groups: [
        { id: 'vpc-1', kind: 'network', name: 'VPC' },
        { id: 'sub-1', kind: 'subnet', name: 'Subnet', parent: 'vpc-1' },
      ],
      components: [{ id: 'db-1', type: 'database.relational', name: 'DB', group: 'vpc-1' }],
    };
    const next = applyCommand(m, { type: 'RemoveGroup', groupId: 'vpc-1' });
    expect(next.groups!.map((g) => g.id)).toEqual(['sub-1']);
    expect(next.groups![0]!.parent).toBeUndefined(); // child group orphaned
    expect(next.components![0]!.group).toBeUndefined(); // child component orphaned
  });
});
