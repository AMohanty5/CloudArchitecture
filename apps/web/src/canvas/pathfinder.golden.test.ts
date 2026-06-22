import { describe, expect, it } from 'vitest';
import { buildRulesGraph, findIntermediaryPaths, assessConnection } from './pathfinder';
import type { GraphService } from './pathfinder';
import { evaluateConnection } from './connections';
import { PATTERNS } from './patterns';
import type { ConnectionRules } from '../lib/queries';

/**
 * Phase 3B golden (Day 106). Pins the path-finder over the **reported logical errors**
 * (EventBridge → S3, CloudWatch → S3) and proves the **pattern library** only wires edges the
 * catalog actually permits. The fixture below is a verbatim slice of the shipped AWS catalog
 * `connectionRules` (catalog/services/aws/*.yaml) — if those YAML rules change, update this
 * fixture so the golden keeps reflecting reality.
 */

const r = (x: ConnectionRules): ConnectionRules => x;

// Verbatim from catalog/services/aws/*.yaml (the messaging / compute / storage / observability
// / security subgraph the reported cases + patterns touch).
const CATALOG: GraphService[] = [
  {
    key: 'aws.eventbridge',
    type: 'messaging.eventbus',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function', 'compute.container.orchestrator.service', 'integration.scheduler'] }],
      outbound: [{ kinds: ['async'], to: ['compute.serverless.function', 'messaging.queue', 'messaging.topic', 'integration.workflow'] }],
    }),
  },
  {
    key: 'aws.lambda',
    type: 'compute.serverless.function',
    rules: r({
      inbound: [
        { kinds: ['traffic'], protocols: ['https'], from: ['network.gateway.api', 'network.loadbalancer.l7'] },
        { kinds: ['async'], from: ['messaging.queue', 'messaging.topic'] },
      ],
      outbound: [
        { kinds: ['data'], to: ['database.relational', 'database.keyvalue', 'database.cache', 'storage.object'] },
        { kinds: ['async'], to: ['messaging.queue', 'messaging.topic'] },
      ],
    }),
  },
  { key: 'aws.s3', type: 'storage.object', rules: r({ inbound: [{ kinds: ['data'], protocols: ['https'], from: ['compute.serverless.function', 'compute.vm', 'network.cdn'] }] }) },
  {
    key: 'aws.sns',
    type: 'messaging.topic',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function', 'compute.vm'] }],
      outbound: [{ kinds: ['async'], to: ['messaging.queue', 'compute.serverless.function'] }],
    }),
  },
  {
    key: 'aws.sqs',
    type: 'messaging.queue',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function', 'compute.vm', 'messaging.topic'] }],
      outbound: [{ kinds: ['async'], to: ['compute.serverless.function'] }],
    }),
  },
  {
    key: 'aws.cloudwatch',
    type: 'observability.metrics',
    rules: r({
      inbound: [{ kinds: ['dependency'], from: ['compute.vm', 'compute.container.orchestrator.service', 'compute.serverless.function', 'database.relational', 'network.loadbalancer.l7'] }],
      outbound: [{ kinds: ['async'], to: ['messaging.topic'] }],
    }),
  },
  {
    key: 'aws.iam_role',
    type: 'security.identity.principal',
    rules: r({
      inbound: [{ kinds: ['identity'], from: ['security.identity'] }],
      outbound: [{ kinds: ['identity'], to: ['compute.serverless.function', 'compute.container.orchestrator.service', 'compute.vm', 'storage.object', 'database.relational'] }],
    }),
  },
];

const graph = buildRulesGraph(CATALOG);
const endpointOf = (serviceKey: string) => {
  const s = CATALOG.find((x) => x.key === serviceKey)!;
  return { type: s.type, rules: s.rules };
};

describe('Phase 3B golden — reported logical errors', () => {
  it('EventBridge → S3 is needs-intermediary, routed through Lambda (matches the event-to-store pattern)', () => {
    const a = assessConnection(endpointOf('aws.eventbridge'), endpointOf('aws.s3'), graph);
    expect(a.status).toBe('needs-intermediary');
    if (a.status === 'needs-intermediary') {
      expect(a.path.map((s) => s.serviceKey)).toEqual(['aws.lambda', 'aws.s3']);
      expect(a.path.map((s) => s.kind)).toEqual(['async', 'data']);
    }
  });

  it('CloudWatch → S3 is needs-intermediary, routed through SNS → Lambda', () => {
    const a = assessConnection(endpointOf('aws.cloudwatch'), endpointOf('aws.s3'), graph);
    expect(a.status).toBe('needs-intermediary');
    if (a.status === 'needs-intermediary') {
      expect(a.path.map((s) => s.serviceKey)).toEqual(['aws.sns', 'aws.lambda', 'aws.s3']);
    }
  });

  it('a supported direct edge is not re-routed, and a true dead-end is unsupported', () => {
    expect(assessConnection(endpointOf('aws.lambda'), endpointOf('aws.s3'), graph).status).toBe('supported');
    expect(assessConnection(endpointOf('aws.s3'), endpointOf('aws.eventbridge'), graph).status).toBe('unsupported');
  });

  it('is deterministic (same paths on repeated runs)', () => {
    const a = findIntermediaryPaths(graph, 'messaging.eventbus', 'storage.object');
    const b = findIntermediaryPaths(graph, 'messaging.eventbus', 'storage.object');
    expect(a).toEqual(b);
  });
});

describe('Phase 3B golden — pattern library wires only catalog-permitted edges', () => {
  it('every connection in every pattern fragment is a valid catalog connection', () => {
    for (const p of PATTERNS) {
      const serviceById = new Map(p.fragment.components.map((c) => [c.id, c.binding!.service]));
      for (const cn of p.fragment.connections) {
        const from = endpointOf(serviceById.get(cn.from)!);
        const to = endpointOf(serviceById.get(cn.to)!);
        const v = evaluateConnection(from, to);
        expect(v.allowed, `${p.id}: ${cn.from} → ${cn.to}`).toBe(true);
        // The authored kind must be one the catalog rule actually permits for that edge.
        expect(v.kinds, `${p.id}: ${cn.id} kind`).toContain(cn.kind);
      }
    }
  });
});
