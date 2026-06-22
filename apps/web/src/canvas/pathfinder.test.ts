import { describe, expect, it } from 'vitest';
import { assessConnection, buildRulesGraph, findIntermediaryPaths } from './pathfinder';
import type { GraphService } from './pathfinder';
import type { ConnectionRules } from '../lib/queries';

const r = (x: ConnectionRules): ConnectionRules => x;

// A focused slice of the real AWS catalog rules — the reported EventBridge/S3 case + its
// messaging neighbourhood, so the path-finder runs over realistic data.
const services: GraphService[] = [
  {
    key: 'aws.eventbridge',
    type: 'messaging.eventbus',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function', 'integration.scheduler'] }],
      outbound: [{ kinds: ['async'], to: ['compute.serverless.function', 'messaging.queue', 'messaging.topic'] }],
    }),
  },
  {
    key: 'aws.lambda',
    type: 'compute.serverless.function',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['messaging.queue', 'messaging.topic'] }],
      outbound: [
        { kinds: ['data'], to: ['database.keyvalue', 'storage.object'] },
        { kinds: ['async'], to: ['messaging.queue', 'messaging.topic'] },
      ],
    }),
  },
  {
    key: 'aws.s3',
    type: 'storage.object',
    rules: r({ inbound: [{ kinds: ['data'], from: ['compute.serverless.function', 'compute.vm'] }] }),
  },
  {
    key: 'aws.sqs',
    type: 'messaging.queue',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function', 'messaging.topic'] }],
      outbound: [{ kinds: ['async'], to: ['compute.serverless.function'] }],
    }),
  },
  {
    key: 'aws.sns',
    type: 'messaging.topic',
    rules: r({
      inbound: [{ kinds: ['async'], from: ['compute.serverless.function'] }],
      outbound: [{ kinds: ['async'], to: ['messaging.queue', 'compute.serverless.function'] }],
    }),
  },
];

const graph = buildRulesGraph(services);

describe('buildRulesGraph', () => {
  it('maps each type to a representative service', () => {
    expect(graph.representative.get('compute.serverless.function')).toBe('aws.lambda');
    expect(graph.representative.get('storage.object')).toBe('aws.s3');
    expect(graph.representative.get('messaging.eventbus')).toBe('aws.eventbridge');
  });

  it('adds a direct edge only where the rules permit one', () => {
    const out = graph.edges.get('messaging.eventbus')!.map((e) => e.to);
    expect(out).toContain('compute.serverless.function'); // EventBridge → Lambda
    expect(out).not.toContain('storage.object'); // EventBridge → S3 is the rejected case
    expect(graph.edges.get('compute.serverless.function')!.map((e) => e.to)).toContain('storage.object'); // Lambda → S3
  });

  it('picks the lowest key when several services share a type', () => {
    const g = buildRulesGraph([
      { key: 'aws.zzz', type: 'storage.object', rules: r({}) },
      { key: 'aws.aaa', type: 'storage.object', rules: r({}) },
    ]);
    expect(g.representative.get('storage.object')).toBe('aws.aaa');
  });
});

describe('findIntermediaryPaths', () => {
  it('routes EventBridge → S3 through Lambda (the reported logical error)', () => {
    const paths = findIntermediaryPaths(graph, 'messaging.eventbus', 'storage.object');
    expect(paths.length).toBeGreaterThan(0);
    const shortest = paths[0]!;
    expect(shortest.map((s) => s.type)).toEqual(['compute.serverless.function', 'storage.object']);
    expect(shortest.map((s) => s.serviceKey)).toEqual(['aws.lambda', 'aws.s3']);
    expect(shortest[0]!.kind).toBe('async'); // EventBridge → Lambda is async
    expect(shortest[1]!.kind).toBe('data'); // Lambda → S3 is data
  });

  it('returns the shortest path first', () => {
    const paths = findIntermediaryPaths(graph, 'messaging.eventbus', 'storage.object');
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i]!.length).toBeGreaterThanOrEqual(paths[i - 1]!.length);
    }
  });

  it('returns nothing when no path exists (S3 → EventBridge: storage is a sink)', () => {
    expect(findIntermediaryPaths(graph, 'storage.object', 'messaging.eventbus')).toEqual([]);
  });

  it('returns nothing for same / unknown types', () => {
    expect(findIntermediaryPaths(graph, 'storage.object', 'storage.object')).toEqual([]);
    expect(findIntermediaryPaths(graph, 'does.not.exist', 'storage.object')).toEqual([]);
  });

  it('respects the maxPaths cap', () => {
    expect(findIntermediaryPaths(graph, 'messaging.eventbus', 'storage.object', { maxPaths: 1 })).toHaveLength(1);
  });
});

describe('assessConnection', () => {
  const ep = (key: string) => {
    const s = services.find((x) => x.key === key)!;
    return { type: s.type, rules: s.rules };
  };
  const nameOf = (key: string) => ({ 'aws.lambda': 'Lambda', 'aws.s3': 'S3', 'aws.sqs': 'SQS', 'aws.sns': 'SNS' })[key] ?? key;

  it('reports a direct connection as supported with its kind', () => {
    const a = assessConnection(ep('aws.lambda'), ep('aws.s3'), graph, nameOf);
    expect(a.status).toBe('supported');
    if (a.status === 'supported') expect(a.kind).toBe('data');
  });

  it('reports EventBridge → S3 as needs-intermediary with the Lambda path', () => {
    const a = assessConnection(ep('aws.eventbridge'), ep('aws.s3'), graph, nameOf);
    expect(a.status).toBe('needs-intermediary');
    if (a.status === 'needs-intermediary') {
      expect(a.path.map((s) => s.serviceKey)).toEqual(['aws.lambda', 'aws.s3']);
      expect(a.reason).toBe('No direct connection — route via Lambda');
    }
  });

  it('reports a true dead-end as unsupported', () => {
    const a = assessConnection(ep('aws.s3'), ep('aws.eventbridge'), graph, nameOf);
    expect(a.status).toBe('unsupported');
  });

  it('without a graph, a non-direct connection is unsupported (no path search)', () => {
    const a = assessConnection(ep('aws.eventbridge'), ep('aws.s3'));
    expect(a.status).toBe('unsupported');
  });
});
