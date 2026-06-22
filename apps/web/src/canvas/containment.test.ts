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

  it('flags a VPC nested inside another VPC (the test2 repro)', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'outer', kind: 'network', name: 'Outer VPC' },
        { id: 'inner', kind: 'network', name: 'Inner VPC', parent: 'outer' },
      ],
    };
    const v = containmentViolations(model);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ groupId: 'inner' });
    expect(v[0]!.message).toMatch(/VPC cannot be nested inside a network/);
  });

  it('flags a VPC nested inside a subnet, and a subnet inside a subnet', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'vpc', kind: 'network', name: 'VPC' },
        { id: 'sub', kind: 'subnet', name: 'Subnet', parent: 'vpc' },
        { id: 'vpc2', kind: 'network', name: 'Bad VPC', parent: 'sub' },
        { id: 'sub2', kind: 'subnet', name: 'Bad Subnet', parent: 'sub' },
      ],
    };
    const ids = violatingGroupIds(model);
    expect(ids.has('vpc2')).toBe(true); // VPC inside a subnet
    expect(ids.has('sub2')).toBe(true); // subnet inside a subnet
    expect(ids.has('sub')).toBe(false); // the valid subnet-in-VPC is fine
  });

  it('still accepts a VPC grouped under a region', () => {
    const model: ProjectableModel = {
      groups: [
        { id: 'reg', kind: 'region', name: 'us-east-1' },
        { id: 'vpc', kind: 'network', name: 'VPC', parent: 'reg' },
      ],
    };
    expect(containmentViolations(model)).toEqual([]);
  });
});
