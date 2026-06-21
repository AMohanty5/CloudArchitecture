/**
 * Canvas design system (Stage G, Day 38). One source of truth for the diagram's
 * look so ServiceNode / GroupNode / Palette / legends stay visually consistent and
 * tunable from a single place. Mirrors the AWS-category colour scheme used by the
 * backend icon generator (apps/core .../catalog/icons.ts).
 */

/** Compact architecture-block geometry. */
export const NODE = { width: 172, height: 54, iconSize: 30, radius: 10 } as const;

/**
 * Composite-node fold geometry (Day 53): an owner node grows by one `compartmentH` per
 * attached resource (EBS/EFS rendered inside it) and one `badgeRowH` when it carries any
 * security/identity badge. Shared by the projector (sizing) and ServiceNode (render) so
 * the laid-out box matches the painted content.
 */
export const FOLD = { compartmentH: 22, badgeRowH: 26 } as const;

/** Corner radii. */
export const RADIUS = { node: 10, group: 12, chip: 8 } as const;

/**
 * Type scale on the 8px rhythm (visual-redesign §5). The hierarchy is inverted from the
 * current render so services dominate: region labels are the largest *context* text, the
 * service name is the loudest *content* text, metadata the quietest.
 *   meta=L4  label=L2 (vpc/subnet)  name=L3 (service)  region=L1
 */
export const TYPE_SCALE = { meta: 10, label: 11, name: 13, region: 16 } as const;

/** 8px spacing grid — all paddings/gaps should be a multiple of 4 drawn from here. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/**
 * Container chrome (visual-redesign §3/§7): faint monochrome washes + near-invisible
 * hairlines, so boundaries read as *context* rather than cages. `wash`/`borderAlpha` are
 * opacities applied to the kind accent; Day 58 swaps GroupNode onto these.
 */
export const CONTAINER = {
  wash: { region: 0.025, network: 0.04, subnetPublic: 0.04, subnetPrivate: 0.03, default: 0.03 },
  borderAlpha: { region: 0.1, network: 0.18, subnet: 0.12, default: 0.14 },
} as const;

/** Elevation scale — subtle, modern (no glossy/skeuomorphic effects). */
export const SHADOW = {
  node: '0 1px 2px rgba(15,23,42,0.08)',
  nodeSelected: '0 0 0 3px rgba(37,99,235,0.18), 0 2px 8px rgba(15,23,42,0.10)',
  group: '0 1px 3px rgba(15,23,42,0.05)',
  overlay: '0 1px 3px rgba(15,23,42,0.08)',
} as const;

/**
 * Canvas theme (light / dark) — every surface the diagram paints, so the canvas, nodes,
 * containers, and connectors read from one source (docs/visual-redesign.md §11). Today the
 * canvas consumes `paneBg`/`gridDot`; Day 60 wires the node/container/connector tokens so
 * dark mode covers every surface (not just the backdrop). Dark is its own token set, not an
 * inversion: elevation comes from a lighter panel fill (shadows vanish on dark) and the AWS
 * category colours stay as-is so icons keep popping.
 */
export type CanvasTheme = 'light' | 'dark';
export interface CanvasThemeTokens {
  paneBg: string;
  gridDot: string;
  /** Node card / panel fill. */
  nodeSurface: string;
  text: string;
  muted: string;
  /** Container + divider hairline. */
  hairline: string;
  /** Selection focus ring. */
  selectedRing: string;
  /** Connector strokes by semantic class (the only saturated structural colour is traffic). */
  connector: { traffic: string; data: string; neutral: string };
}
export const CANVAS_THEME: Record<CanvasTheme, CanvasThemeTokens> = {
  light: {
    paneBg: '#f8fafc',
    gridDot: '#e2e8f0',
    nodeSurface: '#ffffff',
    text: '#1e293b',
    muted: '#94a3b8',
    hairline: 'rgba(148,163,184,0.35)',
    selectedRing: 'rgba(37,99,235,0.18)',
    connector: { traffic: '#2563eb', data: '#059669', neutral: '#94a3b8' },
  },
  dark: {
    paneBg: '#0f172a',
    gridDot: '#1e293b',
    nodeSurface: '#111a2e',
    text: '#e2e8f0',
    muted: '#64748b',
    hairline: 'rgba(148,163,184,0.22)',
    selectedRing: 'rgba(96,165,250,0.45)',
    connector: { traffic: '#60a5fa', data: '#34d399', neutral: '#64748b' },
  },
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
