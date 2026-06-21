import { describe, expect, it } from 'vitest';
import { project } from './projector';
import { generateLargeModel } from './fixtures';
import type { FoldItem, ProjectableModel } from './projector';

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

  describe('section panels (tier groups)', () => {
    const sectioned: ProjectableModel = {
      groups: [
        { id: 'orchestration', kind: 'tier', name: 'Orchestration' },
        { id: 'data', kind: 'tier', name: 'Data' },
      ],
      components: [
        { id: 'svc-a', name: 'A', type: 'compute.serverless.function', binding: { provider: 'aws', service: 'aws.lambda' }, group: 'orchestration' },
        { id: 'svc-b', name: 'B', type: 'compute.serverless.function', binding: { provider: 'aws', service: 'aws.lambda' }, group: 'orchestration' },
        { id: 'db', name: 'DB', type: 'database.keyvalue', binding: { provider: 'aws', service: 'aws.dynamodb' }, group: 'data' },
      ],
      connections: [
        { id: 'a-db', from: 'svc-a', to: 'db', kind: 'data' },
        { id: 'b-db', from: 'svc-b', to: 'db', kind: 'data' },
      ],
    };

    it('renders a tier group as a panel with item rows, not separate service nodes', () => {
      const { nodes } = project(sectioned);
      const orch = nodes.find((n) => n.id === 'orchestration')!;
      expect(orch.type).toBe('group');
      expect((orch.data.items as unknown[]).length).toBe(2);
      expect(nodes.find((n) => n.id === 'svc-a')).toBeUndefined();
      expect(nodes.find((n) => n.id === 'db')).toBeUndefined();
    });

    it('remaps section-row edges to the panel and dedupes equal panel↔panel edges', () => {
      const { edges } = project(sectioned);
      expect(edges).toHaveLength(1); // a-db + b-db → orchestration→data (data), deduped
      expect(edges[0]).toMatchObject({ source: 'orchestration', target: 'data', data: { kind: 'data' } });
    });
  });

  describe('relationship folding (Day 53)', () => {
    // The test2 scenario: EC2 with an attached EBS, a securing SG, an assumed role, and a
    // data link to S3. EBS/SG/role fold into EC2; only the EC2→S3 line survives.
    const folded: ProjectableModel = {
      groups: [{ id: 'sub', kind: 'subnet', name: 'Subnet' }],
      components: [
        { id: 'ec2', name: 'App', type: 'compute.vm', binding: { provider: 'aws', service: 'aws.ec2' }, group: 'sub' },
        { id: 'ebs', name: 'Data vol', type: 'storage.block', binding: { provider: 'aws', service: 'aws.ebs' }, group: 'sub' },
        { id: 'sg', name: 'sg-web', type: 'network.firewall.network', binding: { provider: 'aws', service: 'aws.security_group' }, group: 'sub' },
        { id: 'role', name: 'AppRole', type: 'security.identity.principal', binding: { provider: 'aws', service: 'aws.iam_role' }, group: 'sub' },
        { id: 's3', name: 'Bucket', type: 'storage.object', binding: { provider: 'aws', service: 'aws.s3' } },
      ],
      connections: [
        { id: 'c-ebs', from: 'ec2', to: 'ebs', kind: 'dependency' }, // attach
        { id: 'c-sg', from: 'sg', to: 'ec2', kind: 'dependency' }, // secure
        { id: 'c-role', from: 'role', to: 'ec2', kind: 'identity' }, // assume
        { id: 'c-s3', from: 'ec2', to: 's3', kind: 'data' }, // communicate
      ],
    };

    it('suppresses folded secondaries (EBS/SG/role) and keeps owners (EC2/S3)', () => {
      const ids = project(folded).nodes.filter((n) => n.type === 'service').map((n) => n.id).sort();
      expect(ids).toEqual(['ec2', 's3']);
    });

    it('folds attachment/security/identity onto the owner node data', () => {
      const ec2 = project(folded).nodes.find((n) => n.id === 'ec2')!;
      expect((ec2.data.attachments as FoldItem[]).map((a) => a.id)).toEqual(['ebs']);
      expect((ec2.data.security as FoldItem[]).map((s) => s.id)).toEqual(['sg']);
      expect((ec2.data.identity as FoldItem[]).map((i) => i.id)).toEqual(['role']);
    });

    it('grows the owner node height by a compartment + a badge row', () => {
      const ec2 = project(folded).nodes.find((n) => n.id === 'ec2')!;
      expect(ec2.style!.height).toBe(46 + 22 + 26); // NODE_H + 1×compartmentH + badgeRowH
    });

    it('draws only the communication edge (EC2→S3), folding the rest', () => {
      const { edges } = project(folded);
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({ id: 'c-s3', source: 'ec2', target: 's3' });
    });

    it('carries the public/private flag onto subnet group data (Day 59 lanes)', () => {
      const m: ProjectableModel = {
        groups: [
          { id: 'pub', kind: 'subnet', name: 'Public', properties: { public: true } },
          { id: 'priv', kind: 'subnet', name: 'Private', properties: { public: false } },
          { id: 'bare', kind: 'subnet', name: 'Bare' },
        ],
      };
      const nodes = project(m).nodes;
      expect(nodes.find((n) => n.id === 'pub')!.data.public).toBe(true);
      expect(nodes.find((n) => n.id === 'priv')!.data.public).toBe(false);
      expect(nodes.find((n) => n.id === 'bare')!.data.public).toBe(false); // default private
    });

    it('folds a NACL into its subnet group as a security chip (no node, no line)', () => {
      const m: ProjectableModel = {
        groups: [{ id: 'sub', kind: 'subnet', name: 'Private' }],
        components: [{ id: 'nacl', name: 'acl-1', type: 'network.firewall.network', binding: { provider: 'aws', service: 'aws.nacl' } }],
        connections: [{ id: 'c-nacl', from: 'nacl', to: 'sub', kind: 'dependency' }],
      };
      const { nodes, edges } = project(m);
      expect(nodes.find((n) => n.id === 'nacl')).toBeUndefined();
      expect((nodes.find((n) => n.id === 'sub')!.data.security as FoldItem[]).map((s) => s.name)).toEqual(['acl-1']);
      expect(edges).toHaveLength(0);
    });
  });

  describe('composed mode (Day 70)', () => {
    it('flattens leaf nodes (absolute, no parentId) and replaces containers with backdrops', () => {
      const { nodes } = project(threeTier, undefined, { compose: true });
      const services = nodes.filter((n) => n.type === 'service');
      const groups = nodes.filter((n) => n.type === 'group');
      // leaves are flat
      expect(services.map((n) => n.id).sort()).toEqual(['app-asg', 'web-lb']);
      for (const s of services) expect(s.parentId).toBeUndefined();
      // structural containers became backdrops (behind nodes, flagged)
      expect(groups.map((n) => n.id).sort()).toEqual(['region', 'subnet-app', 'subnet-pub', 'vpc']);
      for (const g of groups) {
        expect(g.data.backdrop).toBe(true);
        expect(g.parentId).toBeUndefined();
        expect(g.zIndex!).toBeLessThan(0);
      }
      // backdrops come before nodes in the list (painted behind)
      expect(nodes.findIndex((n) => n.id === 'vpc')).toBeLessThan(nodes.findIndex((n) => n.id === 'web-lb'));
    });

    it('leaves the default (nested) projection unchanged', () => {
      const web = project(threeTier).nodes.find((n) => n.id === 'web-lb')!;
      expect(web.parentId).toBe('subnet-pub'); // still nested without the flag
    });
  });

  describe('Internet entry node (Day 63)', () => {
    it('synthesizes an Internet origin + edge for an internet-facing entry point', () => {
      const m: ProjectableModel = {
        components: [
          { id: 'lb', name: 'ALB', type: 'network.loadbalancer.l7', binding: { provider: 'aws', service: 'aws.alb' }, properties: { scheme: 'internet-facing' } },
          { id: 'app', name: 'App', type: 'compute.vm', binding: { provider: 'aws', service: 'aws.ec2' } },
        ],
        connections: [{ id: 'lb-app', from: 'lb', to: 'app', kind: 'traffic' }],
      };
      const { nodes, edges } = project(m);
      const entry = nodes.find((n) => n.type === 'entry');
      expect(entry?.id).toBe('__internet');
      expect(edges).toContainEqual(expect.objectContaining({ source: '__internet', target: 'lb', data: { kind: 'traffic' } }));
    });

    it('adds no entry node when nothing is internet-facing (internal LB / plain model)', () => {
      const internal: ProjectableModel = {
        components: [{ id: 'lb', name: 'LB', type: 'network.loadbalancer.l7', binding: { provider: 'aws', service: 'aws.alb' }, properties: { scheme: 'internal' } }],
      };
      expect(project(internal).nodes.some((n) => n.type === 'entry')).toBe(false);
      expect(project({ components: [] }).nodes.some((n) => n.type === 'entry')).toBe(false);
    });
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
