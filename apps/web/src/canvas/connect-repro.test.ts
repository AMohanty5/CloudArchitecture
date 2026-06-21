import { describe, expect, it } from 'vitest';
import { project } from './projector';
import type { ProjectableModel } from './projector';
import { evaluateConnection, groupEndpointType } from './connections';
import type { Endpoint } from './connections';
import type { ConnectionRules } from '../lib/queries';

/**
 * Day 51 — reproduction & instrumentation for the persistent "can't attach EBS/SG to
 * EC2" report. These tests exercise the real `project()` + verdict path (the same logic
 * `Editor.endpointFor` + `evaluateConnection` run at drag time) to pin *where* the
 * connection actually breaks. They double as regression guards for the Day 52 fixes.
 *
 * Findings (see docs/visual-redesign.md Phase 1):
 *  - BLOCKER A (tier/section groups): a component inside a `tier` section panel is not
 *    emitted as a node — it has no handle, so it can never be a connection endpoint.
 *  - BLOCKER B (async rules race): a freshly-dropped service has no connection rules in
 *    cache yet, so the first connection attempts are rejected until the query resolves.
 *  - NOT the blocker (subnet layout): in the screenshot's 3-tier the verdict ALLOWS the
 *    connection, so any remaining failure there is in the React Flow DOM layer
 *    (nested-handle reachability) — to be confirmed in-browser on Day 52.
 */

// Rules mirroring the live deployed catalog (verified by curl on the box, Day 49/48).
const RULES: Record<string, ConnectionRules> = {
  'aws.ebs': { inbound: [{ kinds: ['dependency'], from: ['compute.vm'] }] },
  'aws.security_group': {
    outbound: [{ kinds: ['dependency'], to: ['compute.vm', 'database.relational', 'database.cache'] }],
  },
  'aws.ec2_asg': {
    inbound: [{ kinds: ['traffic'], from: ['network.loadbalancer.l7'] }],
    outbound: [{ kinds: ['data'], to: ['database.relational', 'storage.object'] }],
  },
};

/** Mirror of Editor.endpointFor: components carry type+rules; groups carry group.<kind>. */
function endpointFor(model: ProjectableModel, rulesByService: Map<string, ConnectionRules | undefined>, nodeId: string): Endpoint | undefined {
  const c = (model.components ?? []).find((x) => x.id === nodeId);
  if (c) return { type: c.type, rules: rulesByService.get(c.binding?.service ?? '') };
  const g = (model.groups ?? []).find((x) => x.id === nodeId);
  if (g) return { type: groupEndpointType(g.kind) };
  return undefined;
}

function verdict(model: ProjectableModel, rules: Map<string, ConnectionRules | undefined>, from: string, to: string) {
  const a = endpointFor(model, rules, from);
  const b = endpointFor(model, rules, to);
  if (!a || !b) return { allowed: false as const };
  return evaluateConnection(a, b);
}

/** The screenshot's 3-tier (region ⊃ vpc ⊃ subnet), with a dropped EBS + SG at top level. */
const subnetModel: ProjectableModel = {
  groups: [
    { id: 'region', kind: 'region', name: 'us-east-1' },
    { id: 'vpc', kind: 'network', name: 'VPC', parent: 'region' },
    { id: 'sub-app', kind: 'subnet', name: 'Private', parent: 'vpc' },
  ],
  components: [
    { id: 'app', type: 'compute.vm.autoscaling_group', name: 'App tier', binding: { provider: 'aws', service: 'aws.ec2_asg' }, group: 'sub-app' },
    { id: 'ebs', type: 'storage.block', name: 'EBS', binding: { provider: 'aws', service: 'aws.ebs' } },
    { id: 'sg', type: 'network.firewall.network', name: 'SG', binding: { provider: 'aws', service: 'aws.security_group' } },
  ],
};

const loaded = new Map<string, ConnectionRules | undefined>(Object.entries(RULES));

describe('Day 51 repro — subnet-grouped 3-tier (the screenshot)', () => {
  it('emits EC2/EBS/SG as connectable service nodes (they have handles)', () => {
    const ids = project(subnetModel).nodes.filter((n) => n.type === 'service').map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['app', 'ebs', 'sg']));
  });

  it('the verdict ALLOWS EBS↔EC2 and SG↔EC2 both directions once rules are loaded', () => {
    expect(verdict(subnetModel, loaded, 'ebs', 'app').allowed).toBe(true); // flips to dependency
    expect(verdict(subnetModel, loaded, 'app', 'ebs').allowed).toBe(true);
    expect(verdict(subnetModel, loaded, 'sg', 'app').allowed).toBe(true); // forward dependency
    expect(verdict(subnetModel, loaded, 'app', 'sg').allowed).toBe(true); // flips
  });

  it('BLOCKER B — a freshly-dropped service with rules not yet loaded is rejected', () => {
    // useConnectionRules returns undefined for a service whose query has not resolved.
    const racing = new Map<string, ConnectionRules | undefined>([
      ['aws.ec2_asg', RULES['aws.ec2_asg']],
      ['aws.ebs', undefined], // just dropped — query in flight
      ['aws.security_group', undefined],
    ]);
    expect(verdict(subnetModel, racing, 'ebs', 'app').allowed).toBe(false);
    expect(verdict(subnetModel, racing, 'sg', 'app').allowed).toBe(false);
    // …and it starts working the instant the rules resolve (same model, loaded rules):
    expect(verdict(subnetModel, loaded, 'sg', 'app').allowed).toBe(true);
  });
});

describe('Day 51 repro — BLOCKER A: tier/section-grouped components are unconnectable', () => {
  const tierModel: ProjectableModel = {
    groups: [{ id: 'tier-app', kind: 'tier', name: 'App' }],
    components: [
      { id: 'ec2', type: 'compute.vm', name: 'EC2', binding: { provider: 'aws', service: 'aws.ec2' }, group: 'tier-app' },
    ],
  };

  it('does not emit a node for a tier-grouped component (rowified into the panel)', () => {
    const { nodes } = project(tierModel);
    expect(nodes.find((n) => n.id === 'ec2')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'tier-app')?.data?.items).toEqual([
      expect.objectContaining({ id: 'ec2' }),
    ]);
  });

  it('so the component has no handle and can never be an edge endpoint (regression guard)', () => {
    const serviceNodeIds = project(tierModel).nodes.filter((n) => n.type === 'service').map((n) => n.id);
    expect(serviceNodeIds).not.toContain('ec2');
  });
});
