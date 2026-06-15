import { describe, expect, it } from 'vitest';
import { renderHld } from './hld';
import type { CamlDocument } from '@cac/caml';

const ecommerce: CamlDocument = {
  camlVersion: '1.0',
  id: 'arch_ECOM',
  name: 'E-commerce',
  description: 'A two-tier shop.',
  metadata: { owner: 'platform', lifecycle: 'design', catalogVersion: '2026.06.1' },
  requirements: [
    { id: 'req-ha', kind: 'availability', statement: 'Survive an AZ failure', quantity: { azFailures: 1 }, priority: 'must' },
  ],
  groups: [
    { id: 'vpc', kind: 'network', name: 'Main VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } },
    { id: 'sub-a', kind: 'subnet', name: 'App A', parent: 'vpc', provider: 'aws' },
  ],
  components: [
    { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'Web LB', binding: { provider: 'aws', service: 'aws.alb' } },
    {
      id: 'app-asg',
      type: 'compute.vm.autoscaling_group',
      name: 'App',
      group: 'sub-a',
      binding: { provider: 'aws', service: 'aws.ec2_asg' },
      scaling: { mode: 'horizontal', min: 2, max: 10 },
      criticality: 'high',
    },
  ],
  connections: [
    { id: 'lb-app', from: 'web-lb', to: 'app-asg', kind: 'traffic', properties: { protocol: 'https', port: 443, encrypted: true } },
  ],
};

describe('renderHld', () => {
  const md = renderHld(ecommerce);

  it('renders title, description, and a content-hash stamp', () => {
    expect(md).toContain('# E-commerce — High-Level Design');
    expect(md).toContain('A two-tier shop.');
    expect(md).toMatch(/content hash `[0-9a-f]{12}`/);
  });

  it('summarises overview metadata and counts', () => {
    expect(md).toContain('| Owner | platform |');
    expect(md).toContain('| Catalog version | 2026.06.1 |');
    expect(md).toContain('| Components | 2 |');
  });

  it('lists requirements with priority and machine-checkable targets', () => {
    expect(md).toContain('| must | availability | Survive an AZ failure | azFailures=1 |');
  });

  it('renders the topology as a nested tree (subnet under network, component under subnet)', () => {
    expect(md).toContain('- **Main VPC** _(network)_');
    expect(md).toContain('  - **App A** _(subnet)_');
    expect(md).toContain('    - App `aws.ec2_asg`');
    // The load balancer is ungrouped.
    expect(md).toContain('- Web LB `aws.alb` _(ungrouped)_');
  });

  it('tabulates components (with scaling) and connections (resolved endpoint names)', () => {
    expect(md).toContain('| App | compute.vm.autoscaling_group | aws.ec2_asg | App A | horizontal 2–10 | high |');
    expect(md).toContain('| Web LB → App | traffic | https | 443 | yes |');
  });

  it('is deterministic', () => {
    expect(renderHld(ecommerce)).toEqual(md);
  });
});
