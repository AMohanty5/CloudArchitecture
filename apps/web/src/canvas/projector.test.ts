import { describe, expect, it } from 'vitest';
import { project } from './projector';
import type { ProjectableModel } from './projector';

const threeTier: ProjectableModel = {
  groups: [
    { id: 'region', kind: 'region', name: 'us-east-1' },
    { id: 'vpc', kind: 'network', name: 'Main VPC', parent: 'region' },
    { id: 'subnet-pub', kind: 'subnet', name: 'Public', parent: 'vpc' },
    { id: 'subnet-app', kind: 'subnet', name: 'App', parent: 'vpc' },
  ],
  components: [
    { id: 'web-lb', name: 'Web LB', type: 'network.loadbalancer.l7', binding: { provider: 'aws', service: 'aws.alb' }, group: 'subnet-pub' },
    { id: 'app-asg', name: 'App tier', type: 'compute.vm.autoscaling_group', binding: { provider: 'aws', service: 'aws.ec2_asg' }, group: 'subnet-app' },
  ],
  connections: [{ id: 'lb-app', from: 'web-lb', to: 'app-asg', kind: 'traffic' }],
};

describe('project', () => {
  it('maps components to service nodes and groups to group nodes', () => {
    const { nodes } = project(threeTier);
    expect(nodes.filter((n) => n.type === 'service').map((n) => n.id).sort()).toEqual(['app-asg', 'web-lb']);
    expect(nodes.filter((n) => n.type === 'group').map((n) => n.id).sort()).toEqual(['region', 'subnet-app', 'subnet-pub', 'vpc']);
  });

  it('nests via parentId and parents precede children in the node list', () => {
    const { nodes } = project(threeTier);
    const idx = (id: string) => nodes.findIndex((n) => n.id === id);
    expect(nodes.find((n) => n.id === 'vpc')!.parentId).toBe('region');
    expect(nodes.find((n) => n.id === 'web-lb')!.parentId).toBe('subnet-pub');
    expect(idx('region')).toBeLessThan(idx('vpc')); // React Flow requires parent before child
    expect(idx('vpc')).toBeLessThan(idx('subnet-pub'));
    expect(idx('subnet-pub')).toBeLessThan(idx('web-lb'));
  });

  it('carries binding + type onto service node data', () => {
    const { nodes } = project(threeTier);
    expect(nodes.find((n) => n.id === 'app-asg')!.data).toMatchObject({
      name: 'App tier',
      type: 'compute.vm.autoscaling_group',
      service: 'aws.ec2_asg',
      provider: 'aws',
    });
  });

  it('projects connections to labelled edges', () => {
    const { edges } = project(threeTier);
    expect(edges).toEqual([{ id: 'lb-app', source: 'web-lb', target: 'app-asg', label: 'traffic', data: { kind: 'traffic' } }]);
  });

  it('honours a layout sidecar when present', () => {
    const { nodes } = project(threeTier, { positions: { 'web-lb': { x: 999, y: 888 } } });
    expect(nodes.find((n) => n.id === 'web-lb')!.position).toEqual({ x: 999, y: 888 });
  });

  it('handles an empty model', () => {
    expect(project({ components: [] })).toEqual({ nodes: [], edges: [] });
  });
});
