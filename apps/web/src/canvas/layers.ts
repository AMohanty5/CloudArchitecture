/**
 * Architecture layers (Day 76, docs/canvas-composition.md §11). An optional **view** that
 * reorganizes the whole model into horizontal category bands — EDGE → NETWORK → COMPUTE →
 * INTEGRATION → DATA → SECURITY → OBSERVABILITY — independent of infra nesting, so the
 * architecture reads as solution layers (AWS solution-architecture style). Pure classifier;
 * the band layout itself lives in `projector.projectLayers`.
 */

export type ArchLayer = 'edge' | 'network' | 'compute' | 'integration' | 'data' | 'security' | 'observability';

/** Top-to-bottom band order. */
export const LAYER_ORDER: readonly ArchLayer[] = ['edge', 'network', 'compute', 'integration', 'data', 'security', 'observability'];

export const LAYER_LABEL: Record<ArchLayer, string> = {
  edge: 'EDGE',
  network: 'NETWORK',
  compute: 'COMPUTE',
  integration: 'INTEGRATION',
  data: 'DATA',
  security: 'SECURITY',
  observability: 'OBSERVABILITY',
};

/** Map a component's abstract type to its architecture layer. */
export function architectureLayer(type: string): ArchLayer {
  if (
    type.startsWith('network.cdn') ||
    type.startsWith('network.dns') ||
    type.startsWith('network.loadbalancer') ||
    type.startsWith('network.gateway.api') ||
    type.startsWith('network.firewall.waf')
  ) {
    return 'edge';
  }
  if (type.startsWith('network.firewall.network')) return 'security'; // SG / NACL are security controls
  if (type.startsWith('network.')) return 'network'; // VPC gateways, endpoints, links
  if (type.startsWith('compute.')) return 'compute';
  if (type.startsWith('messaging.') || type.startsWith('integration.')) return 'integration';
  if (type.startsWith('database.') || type.startsWith('storage.')) return 'data';
  if (type.startsWith('security.')) return 'security';
  if (type.startsWith('observability.')) return 'observability';
  return 'compute';
}
