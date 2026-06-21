import { describe, expect, it } from 'vitest';
import { containmentViolations, violatingGroupIds } from './containment';
import type { ProjectableModel } from './projector';

describe('containmentViolations', () => {
  it('flags a subnet that is not inside a network', () => {
    const model: ProjectableModel = { groups: [{ id: 'sub-1', kind: 'subnet', name: 'Subnet' }] };
    const v = containmentViolations(model);
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toMatch(/subnet must live inside a network/);
  });

  it('flags a subnet whose parent is not a network', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'reg-1', kind: 'region', name: 'us-east-1' },
        { id: 'sub-1', kind: 'subnet', name: 'Subnet', parent: 'reg-1' },
      ],
    };
    expect(violatingGroupIds(model).has('sub-1')).toBe(true);
  });

  it('accepts a subnet nested in a network', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'vpc-1', kind: 'network', name: 'VPC' },
        { id: 'sub-1', kind: 'subnet', name: 'Subnet', parent: 'vpc-1' },
      ],
    };
    expect(containmentViolations(model)).toEqual([]);
  });

  it('leaves unconstrained kinds (network at top level) alone', () => {
    const model: ProjectableModel = { groups: [{ id: 'vpc-1', kind: 'network', name: 'VPC' }] };
    expect(containmentViolations(model)).toEqual([]);
  });

  it('accepts an AZ in a VPC and a subnet in an AZ (Day 71)', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'vpc', kind: 'network', name: 'VPC' },
        { id: 'az', kind: 'zone', name: 'us-east-1a', parent: 'vpc' },
        { id: 'sub', kind: 'subnet', name: 'Private', parent: 'az' },
      ],
    };
    expect(containmentViolations(model)).toEqual([]);
  });

  it('flags an AZ that is not inside a network', () => {
    expect(violatingGroupIds({ groups: [{ id: 'az', kind: 'zone', name: 'AZ' }] }).has('az')).toBe(true);
  });
});
