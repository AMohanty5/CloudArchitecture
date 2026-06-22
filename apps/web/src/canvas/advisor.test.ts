import { describe, expect, it } from 'vitest';
import { buildAdvisor } from './advisor';
import type { ConnectionRules } from '../lib/queries';

const nameForType = (type: string): string =>
  ({ 'compute.serverless.function': 'AWS Lambda', 'integration.workflow': 'Step Functions', 'storage.object': 'Amazon S3', 'database.relational': 'Amazon RDS' })[type] ?? type;

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

  it('resolves types to names and patterns to insertable library entries', () => {
    const a = buildAdvisor(rules, nameForType)!;
    expect(a.recommended).toEqual(['AWS Lambda', 'Step Functions']);
    expect(a.antiPatterns).toEqual([
      { to: 'Amazon S3', reason: "Event routers don't write to storage directly." },
      { to: 'Amazon RDS', reason: 'Persist through compute.' },
    ]);
    expect(a.patterns).toEqual([
      { id: 'event-fanout', label: 'Event Fan-out' },
      { id: 'event-to-store', label: 'Event → Store' },
    ]);
  });

  it('drops recommendedPatterns ids with no library entry', () => {
    const a = buildAdvisor({ knowledge: { recommendedPatterns: ['event-fanout', 'does-not-exist'] } }, nameForType)!;
    expect(a.patterns).toEqual([{ id: 'event-fanout', label: 'Event Fan-out' }]);
  });

  it('returns null when there is no knowledge block or it is empty', () => {
    expect(buildAdvisor({ outbound: [] }, nameForType)).toBeNull();
    expect(buildAdvisor(undefined, nameForType)).toBeNull();
    expect(buildAdvisor({ knowledge: {} }, nameForType)).toBeNull();
    expect(buildAdvisor({ knowledge: { recommendedPatterns: ['does-not-exist'] } }, nameForType)).toBeNull();
  });
});
