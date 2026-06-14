import { describe, expect, it } from 'vitest';
import { applyCommand, componentFromService, makeComponentId } from './commands';
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
});
