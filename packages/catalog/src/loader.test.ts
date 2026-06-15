import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { CatalogError, groupServiceKey, loadCatalog } from './loader.js';

const catalogRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');

describe('loadCatalog', () => {
  it('loads the seed catalog with the expected service keys', () => {
    const catalog = loadCatalog(catalogRoot);
    expect([...catalog.servicesByKey.keys()].sort()).toEqual([
      'aws.alb',
      'aws.dynamodb',
      'aws.ec2_asg',
      'aws.elasticache_redis',
      'aws.kms',
      'aws.lambda',
      'aws.rds',
      'aws.s3',
      'aws.secrets_manager',
      'aws.sns',
      'aws.sqs',
      'aws.subnet',
      'aws.vpc',
    ]);
  });

  it('indexes group-kind services by provider/kind', () => {
    const catalog = loadCatalog(catalogRoot);
    expect(catalog.groupServicesByProviderKind.get(groupServiceKey('aws', 'network'))?.key).toBe('aws.vpc');
    expect(catalog.groupServicesByProviderKind.get(groupServiceKey('aws', 'subnet'))?.key).toBe('aws.subnet');
  });

  it('each service targets exactly one of abstractTypes / groupKind', () => {
    const catalog = loadCatalog(catalogRoot);
    for (const svc of catalog.servicesByKey.values()) {
      expect(Boolean(svc.abstractTypes) !== Boolean(svc.groupKind)).toBe(true);
    }
  });

  function tempCatalog(files: Record<string, string>): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cac-cat-'));
    copyFileSync(
      path.join(catalogRoot, 'catalog-service.schema.json'),
      path.join(dir, 'catalog-service.schema.json'),
    );
    mkdirSync(path.join(dir, 'services', 'aws'), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(path.join(dir, 'services', 'aws', name), body);
    }
    return dir;
  }

  it('rejects a service that is neither a component nor a group service', () => {
    const dir = tempCatalog({ 'bad.yaml': 'key: aws.bad\nprovider: aws\nname: Bad\nstatus: ga\n' });
    expect(() => loadCatalog(dir)).toThrow(CatalogError);
  });

  it('rejects a key/provider mismatch', () => {
    const dir = tempCatalog({
      'mismatch.yaml': 'key: gcp.thing\nprovider: aws\nname: X\nstatus: ga\nabstractTypes: [compute.vm]\n',
    });
    expect(() => loadCatalog(dir)).toThrow(/does not match provider/);
  });

  it('rejects duplicate service keys', () => {
    const body = 'key: aws.dup\nprovider: aws\nname: Dup\nstatus: ga\nabstractTypes: [compute.vm]\n';
    const dir = tempCatalog({ 'a.yaml': body, 'b.yaml': body });
    expect(() => loadCatalog(dir)).toThrow(/duplicate service key/);
  });
});
