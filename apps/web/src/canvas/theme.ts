/**
 * Canvas design system (Stage G, Day 38). One source of truth for the diagram's
 * look so ServiceNode / GroupNode / Palette / legends stay visually consistent and
 * tunable from a single place. Mirrors the AWS-category colour scheme used by the
 * backend icon generator (apps/core .../catalog/icons.ts).
 */

/** Compact architecture-block geometry. */
export const NODE = { width: 172, height: 54, iconSize: 30, radius: 10 } as const;

/** Corner radii. */
export const RADIUS = { node: 10, group: 12, chip: 8 } as const;

/** Elevation scale — subtle, modern (no glossy/skeuomorphic effects). */
export const SHADOW = {
  node: '0 1px 2px rgba(15,23,42,0.08)',
  nodeSelected: '0 0 0 3px rgba(37,99,235,0.18), 0 2px 8px rgba(15,23,42,0.10)',
  group: '0 1px 3px rgba(15,23,42,0.05)',
  overlay: '0 1px 3px rgba(15,23,42,0.08)',
} as const;

/**
 * Canvas backdrop theme (light / dark) — pane background + grid dots. One token map so
 * the canvas and any future backdrop layers read from a single source (see
 * docs/visual-redesign.md §11). Phase-2 extends this to node/container surfaces.
 */
export type CanvasTheme = 'light' | 'dark';
export const CANVAS_THEME: Record<CanvasTheme, { paneBg: string; gridDot: string }> = {
  light: { paneBg: '#f8fafc', gridDot: '#e2e8f0' },
  dark: { paneBg: '#0f172a', gridDot: '#1e293b' },
};

/** Neutral palette. */
export const NEUTRAL = {
  text: '#1e293b',
  muted: '#94a3b8',
  subtle: '#64748b',
  border: '#e5e7eb',
  paneBg: '#f8fafc',
  gridDot: '#e2e8f0',
} as const;

/** Accent colour per group kind (containers). */
export const KIND_COLOR: Record<string, string> = {
  region: '#8b5cf6', // violet
  network: '#2563eb', // blue (VPC)
  subnet: '#0d9488', // teal
  zone: '#d97706', // amber
  tier: '#6366f1', // indigo
  domain: '#db2777', // pink
  account: '#0891b2', // cyan
  cluster: '#7c3aed', // purple
  custom: '#475569', // slate
};
export const DEFAULT_KIND_COLOR = '#64748b';

/** Service-category colour scheme (matches the AWS category icon tints). */
export const CATEGORY_COLOR: Record<string, string> = {
  compute: '#ED7100',
  database: '#C925D1',
  storage: '#7AA116',
  networking: '#8C4FFF',
  security: '#DD344C',
  messaging: '#E7157B',
  integration: '#E7157B',
  analytics: '#8C4FFF',
  observability: '#E7157B',
};

/** Connector kinds → line style + label, mirroring `edgeStyle` in connections.ts. */
export const CONNECTOR_KINDS: Array<{ kind: string; label: string; color: string; dash?: string }> = [
  { kind: 'traffic', label: 'Traffic', color: '#2563eb' },
  { kind: 'data', label: 'Data', color: '#059669', dash: '6 4' },
  { kind: 'async', label: 'Async / event', color: '#7c3aed', dash: '2 4' },
  { kind: 'replication', label: 'Replication', color: '#0891b2', dash: '6 4' },
  { kind: 'dependency', label: 'Dependency', color: '#64748b', dash: '1 5' },
  { kind: 'peering', label: 'Peering', color: '#94a3b8' },
  { kind: 'identity', label: 'Identity', color: '#94a3b8' },
];

/** The service categories shown in the canvas category legend (label → colour). */
export const CATEGORY_LEGEND: Array<{ label: string; color: string }> = [
  { label: 'Compute', color: CATEGORY_COLOR.compute! },
  { label: 'Database', color: CATEGORY_COLOR.database! },
  { label: 'Storage', color: CATEGORY_COLOR.storage! },
  { label: 'Networking', color: CATEGORY_COLOR.networking! },
  { label: 'Security', color: CATEGORY_COLOR.security! },
  { label: 'Messaging', color: CATEGORY_COLOR.messaging! },
];

/** Translucent variant of a #rrggbb accent. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Accent colour for a group kind. */
export function kindColor(kind?: string): string {
  return KIND_COLOR[kind ?? ''] ?? DEFAULT_KIND_COLOR;
}

export const FONT = "system-ui, -apple-system, sans-serif";
