import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { CatalogError, groupServiceKey, loadCatalog } from './loader.js';

const catalogRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');

describe('loadCatalog', () => {
  it('loads the full Phase-1 AWS seed catalog (60 services, doc 14)', () => {
    const catalog = loadCatalog(catalogRoot);
    const keys = [...catalog.servicesByKey.keys()].sort();
    expect(keys).toEqual([
      'aws.acm',
      'aws.alb',
      'aws.api_gateway',
      'aws.app_runner',
      'aws.aurora_mysql',
      'aws.aurora_postgresql',
      'aws.aurora_serverless',
      'aws.backup',
      'aws.batch',
      'aws.cloudfront',
      'aws.cloudtrail',
      'aws.cloudwatch',
      'aws.cognito',
      'aws.direct_connect',
      'aws.documentdb',
      'aws.dynamodb',
      'aws.ebs',
      'aws.ec2',
      'aws.ec2_asg',
      'aws.ecr',
      'aws.ecs',
      'aws.ecs_service',
      'aws.efs',
      'aws.eks',
      'aws.eks_service',
      'aws.elasticache_redis',
      'aws.eventbridge',
      'aws.fargate',
      'aws.global_accelerator',
      'aws.glue',
      'aws.iam',
      'aws.iam_role',
      'aws.internet_gateway',
      'aws.kinesis',
      'aws.kms',
      'aws.lambda',
      'aws.msk',
      'aws.nacl',
      'aws.nat_gateway',
      'aws.nlb',
      'aws.opensearch',
      'aws.privatelink',
      'aws.rds',
      'aws.redshift',
      'aws.route53',
      'aws.s3',
      'aws.s3_glacier',
      'aws.scheduler',
      'aws.secrets_manager',
      'aws.security_group',
      'aws.sns',
      'aws.sqs',
      'aws.step_functions',
      'aws.subnet',
      'aws.timestream',
      'aws.transit_gateway',
      'aws.vpc',
      'aws.vpc_peering',
      'aws.vpn_gateway',
      'aws.waf',
    ]);
    expect(keys).toHaveLength(60);
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
