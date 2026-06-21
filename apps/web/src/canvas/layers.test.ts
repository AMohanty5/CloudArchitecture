import { describe, expect, it } from 'vitest';
import { architectureLayer, LAYER_ORDER } from './layers';

describe('architectureLayer', () => {
  it('routes edge/networking resources to EDGE vs NETWORK', () => {
    expect(architectureLayer('network.loadbalancer.l7')).toBe('edge');
    expect(architectureLayer('network.cdn')).toBe('edge');
    expect(architectureLayer('network.firewall.waf')).toBe('edge');
    expect(architectureLayer('network.gateway.nat')).toBe('network');
    expect(architectureLayer('network.firewall.network')).toBe('security'); // SG/NACL → security
    expect(architectureLayer('network.endpoint.private')).toBe('network');
  });

  it('routes compute / integration / data / security / observability', () => {
    expect(architectureLayer('compute.vm')).toBe('compute');
    expect(architectureLayer('compute.serverless.function')).toBe('compute');
    expect(architectureLayer('messaging.queue')).toBe('integration');
    expect(architectureLayer('integration.etl')).toBe('integration');
    expect(architectureLayer('database.relational')).toBe('data');
    expect(architectureLayer('storage.object')).toBe('data');
    expect(architectureLayer('security.identity.principal')).toBe('security');
    expect(architectureLayer('observability.metrics')).toBe('observability');
  });

  it('every layer has a defined order slot', () => {
    expect(new Set(LAYER_ORDER).size).toBe(LAYER_ORDER.length);
  });
});
