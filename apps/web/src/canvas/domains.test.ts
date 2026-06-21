import { describe, expect, it } from 'vitest';
import { domainOf, shortName, DOMAIN_ORDER, pushRecent } from './domains';

describe('domainOf', () => {
  it('routes groupKind + TGW/peering to Architecture Containers', () => {
    expect(domainOf({ groupKind: 'network' })).toBe('containers'); // VPC
    expect(domainOf({ groupKind: 'subnet' })).toBe('containers');
    expect(domainOf({ groupKind: 'region' })).toBe('containers'); // synthetic
    expect(domainOf({ abstractTypes: ['network.gateway.transit'] })).toBe('containers');
    expect(domainOf({ abstractTypes: ['network.link.peering'] })).toBe('containers');
  });

  it('routes networking vs security correctly', () => {
    expect(domainOf({ abstractTypes: ['network.loadbalancer.l7'] })).toBe('edge');
    expect(domainOf({ abstractTypes: ['network.gateway.nat'] })).toBe('edge');
    expect(domainOf({ abstractTypes: ['network.firewall.waf'] })).toBe('edge');
    expect(domainOf({ abstractTypes: ['network.firewall.network'] })).toBe('security'); // SG/NACL
    expect(domainOf({ abstractTypes: ['security.identity.principal'] })).toBe('security');
  });

  it('routes compute / data / integration / observability', () => {
    expect(domainOf({ abstractTypes: ['compute.vm'] })).toBe('compute');
    expect(domainOf({ abstractTypes: ['storage.object'] })).toBe('data');
    expect(domainOf({ abstractTypes: ['database.relational'] })).toBe('data');
    expect(domainOf({ abstractTypes: ['messaging.queue'] })).toBe('integration');
    expect(domainOf({ abstractTypes: ['observability.metrics'] })).toBe('observability');
  });

  it('shortName strips the Amazon/AWS prefix', () => {
    expect(shortName('Amazon EC2')).toBe('EC2');
    expect(shortName('AWS Lambda')).toBe('Lambda');
    expect(shortName('Interface VPC Endpoint (PrivateLink)')).toBe('Interface VPC Endpoint (PrivateLink)');
  });

  it('every domain has an order slot', () => {
    expect(new Set(DOMAIN_ORDER).size).toBe(DOMAIN_ORDER.length);
  });

  it('pushRecent is an LRU: front-loads, dedupes, caps', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']); // moves to front, no dup
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']); // capped at 3
  });
});
