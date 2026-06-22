import { describe, expect, it } from 'vitest';
import { buildAdvisor, humanizePattern } from './advisor';
import type { ConnectionRules } from '../lib/queries';

const nameForType = (type: string): string =>
  ({ 'compute.serverless.function': 'AWS Lambda', 'integration.workflow': 'Step Functions', 'storage.object': 'Amazon S3', 'database.relational': 'Amazon RDS' })[type] ?? type;

describe('humanizePattern', () => {
  it('title-cases a kebab id', () => {
    expect(humanizePattern('event-fanout')).toBe('Event Fanout');
    expect(humanizePattern('event-to-store')).toBe('Event To Store');
  });
});

describe('buildAdvisor', () => {
  const rules: ConnectionRules = {
    outbound: [{ kinds: ['async'], to: ['compute.serverless.function'] }],
    knowledge: {
      recommendedTargets: ['compute.serverless.function', 'integration.workflow'],
      antiPatterns: [
        { to: 'storage.object', reason: "Event routers don't write to storage directly." },
        { to: 'database.relational', reason: 'Persist through compute.' },
      ],
      recommendedPatterns: ['event-fanout', 'event-to-store'],
    },
  };

  it('resolves types to display names and humanizes patterns', () => {
    const a = buildAdvisor(rules, nameForType)!;
    expect(a.recommended).toEqual(['AWS Lambda', 'Step Functions']);
    expect(a.antiPatterns).toEqual([
      { to: 'Amazon S3', reason: "Event routers don't write to storage directly." },
      { to: 'Amazon RDS', reason: 'Persist through compute.' },
    ]);
    expect(a.patterns).toEqual(['Event Fanout', 'Event To Store']);
  });

  it('returns null when there is no knowledge block or it is empty', () => {
    expect(buildAdvisor({ outbound: [] }, nameForType)).toBeNull();
    expect(buildAdvisor(undefined, nameForType)).toBeNull();
    expect(buildAdvisor({ knowledge: {} }, nameForType)).toBeNull();
  });
});
