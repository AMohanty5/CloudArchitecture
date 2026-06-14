import { describe, expect, it } from 'vitest';
import { project } from './projector';
import { generateLargeModel } from './fixtures';
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

  it('projects connections to labelled, kind-styled edges', () => {
    const { edges } = project(threeTier);
    expect(edges).toEqual([
      { id: 'lb-app', source: 'web-lb', target: 'app-asg', label: 'traffic', data: { kind: 'traffic' }, style: { stroke: '#2563eb' } },
    ]);
  });

  it('honours a layout sidecar when present', () => {
    const { nodes } = project(threeTier, { positions: { 'web-lb': { x: 999, y: 888 } } });
    expect(nodes.find((n) => n.id === 'web-lb')!.position).toEqual({ x: 999, y: 888 });
  });

  it('handles an empty model', () => {
    expect(project({ components: [] })).toEqual({ nodes: [], edges: [] });
  });

  it('projects a 500-component model with correct counts and parent-before-child order', () => {
    const model = generateLargeModel(500);
    const { nodes, edges } = project(model);
    expect(nodes.filter((n) => n.type === 'service')).toHaveLength(500);
    expect(nodes.filter((n) => n.type === 'group')).toHaveLength(model.groups!.length);
    expect(edges).toHaveLength(model.connections!.length);
    // Every child node appears after its parent (React Flow requirement for nested nodes).
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    for (const n of nodes) if (n.parentId) expect(index.get(n.parentId)!).toBeLessThan(index.get(n.id)!);
  });
});
