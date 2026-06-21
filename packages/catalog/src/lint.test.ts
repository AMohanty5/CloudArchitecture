import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintConnectionRules } from './lint.js';
import { loadCatalog } from './loader.js';
import type { Catalog, CatalogService } from './types.js';

const catalogRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');

/** Build a minimal Catalog from service definitions (only servicesByKey is linted). */
function catalogOf(services: CatalogService[]): Catalog {
  return {
    servicesByKey: new Map(services.map((s) => [s.key, s])),
    groupServicesByProviderKind: new Map(),
  };
}

const svc = (key: string, extra: Partial<CatalogService>): CatalogService => ({
  key,
  provider: 'aws',
  name: key,
  status: 'ga',
  ...extra,
});

describe('lintConnectionRules', () => {
  it('flags a target type no service provides as a dangling error', () => {
    const cat = catalogOf([
      svc('aws.ec2', { abstractTypes: ['compute.vm'] }),
      svc('aws.ebs', {
        abstractTypes: ['storage.block'],
        connectionRules: { inbound: [{ kinds: ['dependency'], from: ['compute.vm', 'compute.gpu'] }] },
      }),
    ]);
    const findings = lintConnectionRules(cat);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', code: 'dangling-target', service: 'aws.ebs' });
    expect(findings[0]!.message).toContain('compute.gpu');
  });

  it('treats a parent-type reference as live when only a subtype is provided', () => {
    const cat = catalogOf([
      svc('aws.asg', { abstractTypes: ['compute.vm.autoscaling_group'] }),
      svc('aws.ebs', {
        abstractTypes: ['storage.block'],
        connectionRules: { inbound: [{ kinds: ['dependency'], from: ['compute.vm'] }] },
      }),
    ]);
    expect(lintConnectionRules(cat)).toHaveLength(0);
  });

  it('resolves group.<kind> tokens against groupKind services', () => {
    const cat = catalogOf([
      svc('aws.vpc', { groupKind: 'network' }),
      svc('aws.vpc_peering', {
        abstractTypes: ['network.link.peering'],
        connectionRules: { outbound: [{ kinds: ['peering'], to: ['group.network'] }] },
      }),
    ]);
    expect(lintConnectionRules(cat)).toHaveLength(0);
  });

  it('always treats the external sentinel as live', () => {
    const cat = catalogOf([
      svc('aws.igw', {
        abstractTypes: ['network.gateway.internet'],
        connectionRules: { inbound: [{ kinds: ['traffic'], from: ['external'] }] },
      }),
    ]);
    expect(lintConnectionRules(cat)).toHaveLength(0);
  });

  it('warns when a descendant is listed alongside an ancestor that covers it', () => {
    const cat = catalogOf([
      svc('aws.ec2', { abstractTypes: ['compute.vm'] }),
      svc('aws.asg', { abstractTypes: ['compute.vm.autoscaling_group'] }),
      svc('aws.sg', {
        abstractTypes: ['network.firewall.network'],
        connectionRules: { outbound: [{ kinds: ['dependency'], to: ['compute.vm', 'compute.vm.autoscaling_group'] }] },
      }),
    ]);
    const findings = lintConnectionRules(cat);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warning', code: 'redundant-subtype', service: 'aws.sg' });
  });

  it('the shipped catalog has no dangling targets and no redundant subtypes', () => {
    const findings = lintConnectionRules(loadCatalog(catalogRoot));
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings).toEqual([]);
  });
});
