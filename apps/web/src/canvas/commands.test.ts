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
});
