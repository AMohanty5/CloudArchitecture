import { describe, expect, it } from 'vitest';
import { classifyRelationship, isFolded } from './relationships';

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
