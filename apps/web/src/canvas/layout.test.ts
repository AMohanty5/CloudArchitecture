import { describe, expect, it } from 'vitest';
import { fromElkGraph, toElkGraph, tierRank } from './layout';
import type { ProjectedNode, ProjectedEdge } from './projector';

const svcNode = (id: string, type: string): ProjectedNode => ({ id, type: 'service', position: { x: 0, y: 0 }, data: { type }, style: { width: 172, height: 46 } });

const nodes: ProjectedNode[] = [
  { id: 'vpc', type: 'group', position: { x: 0, y: 0 }, data: {}, style: { width: 200, height: 100 } },
  { id: 'web', type: 'service', position: { x: 0, y: 0 }, data: {}, parentId: 'vpc', style: { width: 190, height: 64 } },
  { id: 'db', type: 'service', position: { x: 0, y: 0 }, data: {}, parentId: 'vpc', style: { width: 190, height: 64 } },
  { id: 'lone', type: 'service', position: { x: 0, y: 0 }, data: {}, style: { width: 190, height: 64 } },
];
const edges: ProjectedEdge[] = [{ id: 'e1', source: 'web', target: 'db', label: 'data', data: { kind: 'data' }, style: { stroke: '#000' } }];

describe('toElkGraph', () => {
  it('nests children under their parent group and lifts top-level nodes to the root', () => {
    const g = toElkGraph(nodes, edges);
    expect(g.children?.map((c) => c.id).sort()).toEqual(['lone', 'vpc']);
    const vpc = g.children?.find((c) => c.id === 'vpc');
    expect(vpc?.children?.map((c) => c.id).sort()).toEqual(['db', 'web']);
    expect(g.edges).toEqual([{ id: 'e1', sources: ['web'], targets: ['db'] }]);
  });

  it('uses the layered left-to-right algorithm with child-aware hierarchy', () => {
    const g = toElkGraph(nodes, edges);
    expect(g.layoutOptions?.['elk.algorithm']).toBe('layered');
    expect(g.layoutOptions?.['elk.direction']).toBe('RIGHT');
    expect(g.layoutOptions?.['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
  });
});

describe('tierRank + flow partitioning (Day 64)', () => {
  it('ranks entry → edge → compute → data', () => {
    expect(tierRank({ id: 'i', type: 'entry', position: { x: 0, y: 0 }, data: {} })).toBe(0);
    expect(tierRank(svcNode('lb', 'network.loadbalancer.l7'))).toBe(1);
    expect(tierRank(svcNode('cdn', 'network.cdn'))).toBe(1);
    expect(tierRank(svcNode('app', 'compute.vm'))).toBe(2);
    expect(tierRank(svcNode('q', 'messaging.queue'))).toBe(2);
    expect(tierRank(svcNode('db', 'database.relational'))).toBe(3);
    expect(tierRank(svcNode('s3', 'storage.object'))).toBe(3);
  });

  it('only the flow preset partitions leaves; layered does not', () => {
    const ns = [svcNode('lb', 'network.loadbalancer.l7'), svcNode('db', 'database.relational')];
    const flow = toElkGraph(ns, [], 'flow-lr');
    expect(flow.layoutOptions?.['elk.partitioning.activate']).toBe('true');
    expect(flow.children?.find((c) => c.id === 'lb')?.layoutOptions?.['elk.partitioning.partition']).toBe('1');
    expect(flow.children?.find((c) => c.id === 'db')?.layoutOptions?.['elk.partitioning.partition']).toBe('3');
    const layered = toElkGraph(ns, [], 'layered-lr');
    expect(layered.children?.find((c) => c.id === 'lb')?.layoutOptions?.['elk.partitioning.partition']).toBeUndefined();
  });
});

describe('fromElkGraph', () => {
  it('extracts positions for every node and sizes for groups only', () => {
    const laid = {
      id: 'root',
      children: [
        {
          id: 'vpc',
          x: 10,
          y: 20,
          width: 420,
          height: 220,
          children: [
            { id: 'web', x: 18, y: 36, width: 190, height: 64 },
            { id: 'db', x: 18, y: 130, width: 190, height: 64 },
          ],
        },
        { id: 'lone', x: 500, y: 20, width: 190, height: 64 },
      ],
    };
    const sidecar = fromElkGraph(laid);
    expect(sidecar.positions).toEqual({
      vpc: { x: 10, y: 20 },
      web: { x: 18, y: 36 },
      db: { x: 18, y: 130 },
      lone: { x: 500, y: 20 },
    });
    expect(sidecar.sizes).toEqual({ vpc: { width: 420, height: 220 } }); // only the group is sized
  });
});
