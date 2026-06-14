import { describe, expect, it } from 'vitest';
import { buildFragment, parseFragment, remapFragment } from './clipboard';
import type { ProjectableModel } from './projector';

const model: ProjectableModel = {
  groups: [
    { id: 'vpc-1', kind: 'network', name: 'VPC' },
    { id: 'sub-1', kind: 'subnet', name: 'Subnet', parent: 'vpc-1' },
  ],
  components: [
    { id: 'web-1', type: 'compute.vm.autoscaling_group', name: 'Web', group: 'sub-1', binding: { provider: 'aws', service: 'aws.ec2_asg' } },
    { id: 'db-1', type: 'database.relational', name: 'DB', group: 'sub-1', binding: { provider: 'aws', service: 'aws.rds' } },
    { id: 'lone', type: 'database.relational', name: 'Lone', binding: { provider: 'aws', service: 'aws.rds' } },
  ],
  connections: [{ id: 'c-1', from: 'web-1', to: 'db-1', kind: 'data' }],
};

describe('buildFragment', () => {
  it('copies a single component on its own', () => {
    const frag = buildFragment(model, 'lone')!;
    expect(frag.components).toHaveLength(1);
    expect(frag.groups).toHaveLength(0);
  });

  it('copies a group subtree with its components and internal connections', () => {
    const frag = buildFragment(model, 'vpc-1')!;
    expect(frag.groups.map((g) => g.id).sort()).toEqual(['sub-1', 'vpc-1']);
    expect(frag.components.map((c) => c.id).sort()).toEqual(['db-1', 'web-1']);
    expect(frag.connections).toHaveLength(1);
  });

  it('returns null when nothing copyable is selected', () => {
    expect(buildFragment(model, undefined)).toBeNull();
    expect(buildFragment(model, 'missing')).toBeNull();
  });
});

describe('remapFragment', () => {
  it('assigns fresh ids and rewires all internal references', () => {
    const frag = buildFragment(model, 'vpc-1')!;
    const out = remapFragment(frag);

    // ids changed
    expect(out.groups.every((g) => !['vpc-1', 'sub-1'].includes(g.id))).toBe(true);
    expect(out.components.every((c) => !['web-1', 'db-1'].includes(c.id))).toBe(true);

    // subtree parent rewired to the new vpc id
    const vpc = out.groups.find((g) => g.kind === 'network')!;
    const sub = out.groups.find((g) => g.kind === 'subnet')!;
    expect(sub.parent).toBe(vpc.id);

    // components still point at the new subnet
    expect(out.components.every((c) => c.group === sub.id)).toBe(true);

    // connection rewired to the new endpoints
    const ids = new Set(out.components.map((c) => c.id));
    expect(ids.has(out.connections[0]!.from)).toBe(true);
    expect(ids.has(out.connections[0]!.to)).toBe(true);
  });

  it('drops a dangling group ref when a lone component is pasted', () => {
    const frag = buildFragment(model, 'web-1')!; // its group sub-1 is not in the fragment
    const out = remapFragment(frag);
    expect(out.components[0]!.group).toBeUndefined();
  });
});

describe('parseFragment', () => {
  it('round-trips and rejects foreign payloads', () => {
    const frag = buildFragment(model, 'lone')!;
    expect(parseFragment(JSON.stringify(frag))).toEqual(frag);
    expect(parseFragment('not json')).toBeNull();
    expect(parseFragment('{"hello":1}')).toBeNull();
  });
});
