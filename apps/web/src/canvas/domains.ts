/**
 * Palette domains (Day 79, docs/sidebar-redesign.md §1). Architecture-first taxonomy that
 * replaces the flat service catalog: a pure `domainOf` maps a catalog service to one of nine
 * domains, derived from its abstract type / groupKind. Contact Center + AI domains are empty
 * until the catalog expansion (Phase 3A); empty domains are hidden by the palette.
 */

import type { ServiceSummary } from '../lib/queries';

/** Architecture containers with no catalog service (Region + AZ); dropping one creates a group. */
export const SYNTHETIC_CONTAINERS: ServiceSummary[] = [
  { key: '_region', name: 'AWS Region', provider: 'aws', groupKind: 'region', status: 'ga', iconUrl: '/api/v1/catalog/icons/_region', score: 0 },
  { key: '_az', name: 'Availability Zone', provider: 'aws', groupKind: 'zone', status: 'ga', iconUrl: '/api/v1/catalog/icons/_az', score: 0 },
];

export type Domain =
  | 'containers'
  | 'edge'
  | 'compute'
  | 'data'
  | 'integration'
  | 'security'
  | 'observability'
  | 'contactcenter'
  | 'ai'
  | 'other';

/** Top-to-bottom palette order. */
export const DOMAIN_ORDER: readonly Domain[] = [
  'containers',
  'edge',
  'compute',
  'data',
  'integration',
  'security',
  'observability',
  'contactcenter',
  'ai',
  'other',
];

export const DOMAIN_LABEL: Record<Domain, string> = {
  containers: '🏗 Architecture Containers',
  edge: '🌐 Edge & Networking',
  compute: '💻 Compute',
  data: '🗄 Data & Storage',
  integration: '📨 Integration & Messaging',
  security: '🔐 Security & Identity',
  observability: '📈 Observability',
  contactcenter: '🎧 Contact Center',
  ai: '🤖 AI & GenAI',
  other: 'Other',
};

/** Classify a catalog service into a palette domain. */
export function domainOf(service: { abstractTypes?: string[]; groupKind?: string }): Domain {
  if (service.groupKind) return 'containers'; // Region / VPC / AZ / Subnet
  const t = service.abstractTypes?.[0] ?? '';
  if (t === 'network.gateway.transit' || t.startsWith('network.link.peering')) return 'containers'; // TGW / peering
  if (t.startsWith('contactcenter.') || t.startsWith('telephony.') || t.startsWith('channel.')) return 'contactcenter';
  if (t.startsWith('ai.') || t.startsWith('voiceai.')) return 'ai';
  if (t.startsWith('observability.')) return 'observability';
  if (t.startsWith('security.') || t.startsWith('network.firewall.network')) return 'security'; // IAM/KMS/ACM + SG/NACL
  if (t.startsWith('compute.')) return 'compute';
  if (t.startsWith('database.') || t.startsWith('storage.')) return 'data';
  if (t.startsWith('messaging.') || t.startsWith('integration.')) return 'integration';
  if (t.startsWith('network.')) return 'edge'; // CDN, DNS, LB, gateways, WAF, endpoints, Direct Connect, VPN
  return 'other';
}

/** A short display name — strips the "Amazon "/"AWS " prefix (e.g. "Amazon EC2" → "EC2"). */
export function shortName(name: string): string {
  return name.replace(/^(amazon|aws)\s+/i, '');
}

/** Default pinned favorites on first run. */
export const FAVORITE_DEFAULTS: readonly string[] = ['aws.ec2', 'aws.s3', 'aws.lambda', 'aws.rds', 'aws.vpc'];

/** Most-recently-used list (LRU): move `key` to the front, dedupe, cap the length (Day 80). */
export function pushRecent(recents: readonly string[], key: string, cap = 8): string[] {
  return [key, ...recents.filter((k) => k !== key)].slice(0, cap);
}
