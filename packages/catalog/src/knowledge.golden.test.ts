import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './loader.js';

const catalog = loadCatalog(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog'));
const svc = (key: string) => catalog.servicesByKey.get(key)!;
const outboundTargets = (key: string): string[] => (svc(key).connectionRules?.outbound ?? []).flatMap((r) => r.to ?? []);

/**
 * Phase 3B golden (Day 106) over the *real* catalog — keeps the web path-finder golden's
 * fixture faithful. Asserts the reported logical errors are still genuinely indirect (no
 * direct rule) and that the curated `knowledge` metadata is present where the advisor + the
 * ARC-001 anti-pattern rule rely on it.
 */
describe('catalog knowledge golden', () => {
  it('the reported cases have no direct rule (so the path-finder is genuinely needed)', () => {
    expect(outboundTargets('aws.eventbridge')).not.toContain('storage.object'); // EventBridge → S3
    expect(outboundTargets('aws.cloudwatch')).not.toContain('storage.object'); // CloudWatch → S3
    const s3Inbound = (svc('aws.s3').connectionRules?.inbound ?? []).flatMap((r) => r.from ?? []);
    expect(s3Inbound).not.toContain('messaging.eventbus');
    expect(s3Inbound).not.toContain('observability.metrics');
  });

  it('the high-value services carry the curated knowledge the advisor/ARC-001 use', () => {
    for (const key of ['aws.eventbridge', 'aws.cloudwatch', 'aws.sns', 'aws.iam_role']) {
      expect(svc(key).connectionRules?.knowledge, key).toBeDefined();
    }
    const eb = svc('aws.eventbridge').connectionRules!.knowledge!;
    expect(eb.antiPatterns?.map((a) => a.to)).toContain('storage.object');
    expect(eb.requiresIntermediary?.['storage.object']).toContain('compute.serverless.function');
    expect(eb.recommendedPatterns).toContain('event-to-store');
  });
});
