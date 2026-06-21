import { describe, expect, it } from 'vitest';
import { computeBackdrops } from './backdrops';
import type { Rect } from './backdrops';
import type { ProjectableModel } from './projector';

// region ⊃ vpc ⊃ {subnet-pub (lb), subnet-app (ec2, rds)}
const model: ProjectableModel = {
  groups: [
    { id: 'region', kind: 'region', name: 'us-east-1' },
    { id: 'vpc', kind: 'network', name: 'VPC', parent: 'region' },
    { id: 'pub', kind: 'subnet', name: 'Public', parent: 'vpc', properties: { public: true } },
    { id: 'app', kind: 'subnet', name: 'Private', parent: 'vpc', properties: { public: false } },
  ],
  components: [
    { id: 'lb', name: 'LB', type: 'network.loadbalancer.l7', group: 'pub' },
    { id: 'ec2', name: 'EC2', type: 'compute.vm', group: 'app' },
    { id: 'rds', name: 'RDS', type: 'database.relational', group: 'app' },
  ],
};
const positions = new Map<string, Rect>([
  ['lb', { x: 0, y: 0, width: 100, height: 40 }],
  ['ec2', { x: 0, y: 200, width: 100, height: 40 }],
  ['rds', { x: 0, y: 280, width: 100, height: 40 }],
]);

const rect = (b: { position: { x: number; y: number }; style?: { width: number; height: number } }): Rect => ({
  x: b.position.x,
  y: b.position.y,
  width: b.style!.width,
  height: b.style!.height,
});
const encloses = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;

describe('computeBackdrops', () => {
  const backdrops = computeBackdrops(model, positions);
  const byId = new Map(backdrops.map((b) => [b.id, b]));

  it('emits one backdrop per group, all flagged + flat (no parentId) + behind nodes', () => {
    expect(backdrops.map((b) => b.id).sort()).toEqual(['app', 'pub', 'region', 'vpc']);
    for (const b of backdrops) {
      expect(b.data.backdrop).toBe(true);
      expect(b.parentId).toBeUndefined();
      expect(b.zIndex!).toBeLessThan(0);
    }
  });

  it('a subnet encloses exactly its members', () => {
    const app = rect(byId.get('app')!);
    expect(encloses(app, positions.get('ec2')!)).toBe(true);
    expect(encloses(app, positions.get('rds')!)).toBe(true);
    expect(encloses(app, positions.get('lb')!)).toBe(false); // lb is in another subnet
  });

  it('nesting holds: region ⊇ vpc ⊇ subnets (outer padding is larger)', () => {
    const region = rect(byId.get('region')!);
    const vpc = rect(byId.get('vpc')!);
    expect(encloses(region, vpc)).toBe(true);
    expect(encloses(vpc, rect(byId.get('pub')!))).toBe(true);
    expect(encloses(vpc, rect(byId.get('app')!))).toBe(true);
    // region is furthest back
    expect(byId.get('region')!.zIndex!).toBeLessThan(byId.get('vpc')!.zIndex!);
    expect(byId.get('vpc')!.zIndex!).toBeLessThan(byId.get('app')!.zIndex!);
  });

  it('carries label + kind + subnet public flag', () => {
    expect(byId.get('pub')!.data).toMatchObject({ label: 'Public', kind: 'subnet', public: true });
    expect(byId.get('app')!.data).toMatchObject({ public: false });
  });

  it('nests an AZ layer: region ⊇ vpc ⊇ az ⊇ subnet (Day 71, depth-generic)', () => {
    const azModel: ProjectableModel = {
      groups: [
        { id: 'region', kind: 'region', name: 'us-east-1' },
        { id: 'vpc', kind: 'network', name: 'VPC', parent: 'region' },
        { id: 'az', kind: 'zone', name: 'az-a', parent: 'vpc' },
        { id: 'sub', kind: 'subnet', name: 'Private', parent: 'az' },
      ],
      components: [{ id: 'ec2', name: 'EC2', type: 'compute.vm', group: 'sub' }],
    };
    const bd = new Map(computeBackdrops(azModel, new Map([['ec2', { x: 0, y: 0, width: 100, height: 40 }]])).map((b) => [b.id, b]));
    expect(encloses(rect(bd.get('region')!), rect(bd.get('vpc')!))).toBe(true);
    expect(encloses(rect(bd.get('vpc')!), rect(bd.get('az')!))).toBe(true);
    expect(encloses(rect(bd.get('az')!), rect(bd.get('sub')!))).toBe(true);
  });

  it('skips groups with no laid-out members', () => {
    const empty = computeBackdrops({ groups: [{ id: 'g', kind: 'region', name: 'Empty' }], components: [] }, new Map());
    expect(empty).toEqual([]);
  });
});
