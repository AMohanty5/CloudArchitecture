import { describe, expect, it } from 'vitest';
import type { CatalogService } from '@cac/catalog';
import { rankServices } from './ranking';

const svc = (key: string, name: string, extra: Partial<CatalogService> = {}): CatalogService => ({
  key,
  provider: 'aws',
  name,
  status: 'ga',
  ...extra,
});

const services: CatalogService[] = [
  svc('aws.alb', 'Application Load Balancer', { abstractTypes: ['network.loadbalancer.l7'], capabilities: { tlsTermination: {} } }),
  svc('aws.nlb', 'Network Load Balancer', { abstractTypes: ['network.loadbalancer.l4'] }),
  svc('aws.rds', 'Amazon RDS', { abstractTypes: ['database.relational'] }),
  svc('aws.vpc', 'Amazon VPC', { groupKind: 'network' }),
  svc('azure.lb', 'Azure Load Balancer', { provider: 'azure', abstractTypes: ['network.loadbalancer.l4'] }),
];

describe('rankServices', () => {
  it('ranks "load balancer" — only load balancers, none of rds/vpc', () => {
    const results = rankServices(services, { q: 'load balancer' });
    const keys = results.map((r) => r.service.key);
    expect(keys).toEqual(['aws.alb', 'aws.nlb', 'azure.lb']); // score-tied → key order
    expect(results.every((r) => r.service.name.toLowerCase().includes('load balancer'))).toBe(true);
    expect(keys).not.toContain('aws.rds');
    expect(keys).not.toContain('aws.vpc');
  });

  it('honours the provider filter', () => {
    const keys = rankServices(services, { q: 'load balancer', provider: 'aws' }).map((r) => r.service.key);
    expect(keys).toEqual(['aws.alb', 'aws.nlb']);
  });

  it('matches on key and abstract type, not just name', () => {
    expect(rankServices(services, { q: 'rds' })[0]?.service.key).toBe('aws.rds');
    expect(rankServices(services, { q: 'relational' })[0]?.service.key).toBe('aws.rds');
  });

  it('matches alias keywords (object storage → S3, nosql → DynamoDB, cache → ElastiCache)', () => {
    const more = [
      svc('aws.s3', 'Amazon S3', { abstractTypes: ['storage.object'] }),
      svc('aws.dynamodb', 'Amazon DynamoDB', { abstractTypes: ['database.keyvalue'] }),
      svc('aws.elasticache_redis', 'Amazon ElastiCache', { abstractTypes: ['database.cache'] }),
      ...services,
    ];
    expect(rankServices(more, { q: 'object storage' })[0]?.service.key).toBe('aws.s3');
    expect(rankServices(more, { q: 'nosql' })[0]?.service.key).toBe('aws.dynamodb');
    expect(rankServices(more, { q: 'cache' })[0]?.service.key).toBe('aws.elasticache_redis');
  });

  it('with no query returns everything sorted by name', () => {
    const names = rankServices(services, {}).map((r) => r.service.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(services.length);
  });
});
