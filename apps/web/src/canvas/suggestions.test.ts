import { describe, expect, it } from 'vitest';
import { suggestFor } from './suggestions';
import type { SuggestService } from './suggestions';
import type { ConnectionRules } from '../lib/queries';

const r = (x: ConnectionRules): ConnectionRules => x;
const services: SuggestService[] = [
  { key: 'aws.security_group', type: 'network.firewall.network', rules: r({ outbound: [{ kinds: ['dependency'], to: ['compute.vm', 'database.relational'] }] }) },
  { key: 'aws.iam_role', type: 'security.identity.principal', rules: r({ outbound: [{ kinds: ['identity'], to: ['compute.vm', 'storage.object'] }] }) },
  { key: 'aws.ebs', type: 'storage.block', rules: r({ inbound: [{ kinds: ['dependency'], from: ['compute.vm'] }] }) },
  { key: 'aws.alb', type: 'network.loadbalancer.l7', rules: r({ outbound: [{ kinds: ['traffic'], to: ['compute.vm'] }] }) },
  { key: 'aws.s3', type: 'storage.object', rules: r({ inbound: [{ kinds: ['data'], from: ['compute.vm'] }] }) },
  { key: 'aws.dynamodb', type: 'database.keyvalue', rules: r({ inbound: [{ kinds: ['data'], from: ['compute.serverless.function'] }] }) },
];

describe('suggestFor', () => {
  it('suggests SG / IAM Role / EBS / ALB for an EC2 (curated order)', () => {
    const out = suggestFor({ type: 'compute.vm' }, services, new Set(['aws.ec2']));
    expect(out).toEqual(['aws.security_group', 'aws.iam_role', 'aws.ebs', 'aws.alb']);
  });

  it('excludes services already connected', () => {
    const out = suggestFor({ type: 'compute.vm' }, services, new Set(['aws.ec2', 'aws.security_group', 'aws.ebs']));
    expect(out).not.toContain('aws.security_group');
    expect(out).not.toContain('aws.ebs');
    expect(out[0]).toBe('aws.iam_role');
  });

  it('only suggests services that can actually connect', () => {
    // A subtype of compute.vm still matches compute.vm rules (subtype descent).
    const out = suggestFor({ type: 'compute.vm.autoscaling_group' }, services, new Set());
    expect(out).toContain('aws.security_group');
    expect(out).not.toContain('aws.dynamodb'); // dynamodb only accepts serverless functions
  });

  it('caps the list', () => {
    expect(suggestFor({ type: 'compute.vm' }, services, new Set(), 2)).toHaveLength(2);
  });
});
