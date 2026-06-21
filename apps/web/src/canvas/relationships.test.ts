import { describe, expect, it } from 'vitest';
import { classifyRelationship, groupRelationships, isFolded } from './relationships';

describe('classifyRelationship', () => {
  it('classes runtime flows as communicates_with', () => {
    expect(classifyRelationship('compute.vm', 'storage.object', 'data')).toBe('communicates_with');
    expect(classifyRelationship('network.loadbalancer.l7', 'compute.vm', 'traffic')).toBe('communicates_with');
    expect(classifyRelationship('compute.serverless.function', 'messaging.queue', 'async')).toBe('communicates_with');
    expect(classifyRelationship('database.relational', 'database.relational', 'replication')).toBe('communicates_with');
  });

  it('classes EBS/EFS dependency as attached_to', () => {
    expect(classifyRelationship('compute.vm', 'storage.block', 'dependency')).toBe('attached_to');
    expect(classifyRelationship('storage.block', 'compute.vm', 'dependency')).toBe('attached_to'); // either order
    expect(classifyRelationship('compute.vm', 'storage.file', 'dependency')).toBe('attached_to');
  });

  it('classes firewall/KMS/secrets dependency as secured_by', () => {
    expect(classifyRelationship('network.firewall.network', 'compute.vm', 'dependency')).toBe('secured_by');
    expect(classifyRelationship('database.relational', 'security.keys', 'dependency')).toBe('secured_by');
    expect(classifyRelationship('compute.vm', 'security.secrets', 'dependency')).toBe('secured_by');
  });

  it('classes IAM-principal identity edges as assumes', () => {
    expect(classifyRelationship('security.identity.principal', 'compute.vm', 'identity')).toBe('assumes');
    expect(classifyRelationship('compute.vm', 'security.identity.principal', 'identity')).toBe('assumes');
    // IAM principal -> S3 (a grant) is still folded, not a communication line:
    expect(classifyRelationship('security.identity.principal', 'storage.object', 'identity')).toBe('assumes');
  });

  it('classes non-principal identity (e.g. Cognito auth) as communicates_with', () => {
    expect(classifyRelationship('security.identity.idp', 'network.gateway.api', 'identity')).toBe('communicates_with');
  });

  it('isFolded is true for everything except communicates_with', () => {
    expect(isFolded('attached_to')).toBe(true);
    expect(isFolded('secured_by')).toBe(true);
    expect(isFolded('assumes')).toBe(true);
    expect(isFolded('communicates_with')).toBe(false);
  });
});

describe('groupRelationships', () => {
  const types: Record<string, string> = {
    ec2: 'compute.vm',
    ebs: 'storage.block',
    sg: 'network.firewall.network',
    role: 'security.identity.principal',
    s3: 'storage.object',
  };
  const conns = [
    { id: 'c-ebs', from: 'ec2', to: 'ebs', kind: 'dependency' },
    { id: 'c-sg', from: 'sg', to: 'ec2', kind: 'dependency' },
    { id: 'c-role', from: 'role', to: 'ec2', kind: 'identity' },
    { id: 'c-s3', from: 'ec2', to: 's3', kind: 'data' },
  ];
  const typeOf = (id: string): string | undefined => types[id];

  it('buckets a component’s connections by relationship class', () => {
    const g = groupRelationships('ec2', conns, typeOf);
    expect(g.attachments.map((r) => r.otherId)).toEqual(['ebs']);
    expect(g.security.map((r) => r.otherId)).toEqual(['sg']);
    expect(g.identity.map((r) => r.otherId)).toEqual(['role']);
    expect(g.communications.map((r) => r.otherId)).toEqual(['s3']);
  });

  it('ignores connections that do not touch the component, and group endpoints', () => {
    expect(groupRelationships('s3', conns, typeOf).communications.map((r) => r.connId)).toEqual(['c-s3']);
    // an endpoint with no resolvable type (a group) is skipped
    expect(groupRelationships('ec2', [{ id: 'x', from: 'ec2', to: 'subnet', kind: 'dependency' }], typeOf)).toEqual({
      attachments: [],
      security: [],
      identity: [],
      communications: [],
    });
  });
});
