import { describe, expect, it } from 'vitest';
import { inferSubnetRole, roleTier, subnetRole } from './subnets';

describe('subnetRole', () => {
  it('infers web from an edge resource, app from compute, data from a datastore', () => {
    expect(inferSubnetRole(['network.loadbalancer.l7'])).toBe('web');
    expect(inferSubnetRole(['compute.vm'])).toBe('app');
    expect(inferSubnetRole(['database.relational'])).toBe('data');
    expect(inferSubnetRole(['storage.object'])).toBe('data');
    expect(inferSubnetRole([])).toBe('shared');
  });

  it('prefers the edge role when a subnet mixes an LB with compute', () => {
    expect(inferSubnetRole(['compute.vm', 'network.loadbalancer.l7'])).toBe('web');
  });

  it('honours an explicit, valid properties.role over inference', () => {
    expect(subnetRole('management', ['compute.vm'])).toBe('management');
    expect(subnetRole('DATA', [])).toBe('data'); // case-insensitive
    expect(subnetRole('bogus', ['compute.vm'])).toBe('app'); // invalid → infer
    expect(subnetRole(undefined, ['database.relational'])).toBe('data');
  });

  it('orders lanes web → app → data left-to-right (transit first, mgmt last)', () => {
    expect(roleTier('transit')).toBeLessThan(roleTier('web'));
    expect(roleTier('web')).toBeLessThan(roleTier('app'));
    expect(roleTier('app')).toBeLessThan(roleTier('data'));
    expect(roleTier('data')).toBeLessThan(roleTier('management'));
  });
});
