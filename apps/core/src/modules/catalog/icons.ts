/**
 * Service icon generator. The official AWS Architecture Icon pack is a Backlog
 * item (licensing review), so until that lands we render a deterministic
 * AWS-styled tile per service: a rounded square tinted by the service's
 * category (matching AWS's category colour scheme) with the service's short
 * label, so the palette, canvas nodes, and exports all read as AWS services.
 */

/** AWS category palette, keyed by the first path segment of a service `icon:` (e.g. `aws/database/...`). */
const CATEGORY_COLOR: Record<string, string> = {
  compute: '#ED7100', // orange — Compute & Containers
  containers: '#ED7100',
  database: '#C925D1', // magenta — Database
  storage: '#7AA116', // green — Storage
  networking: '#8C4FFF', // purple — Networking & Content Delivery
  network: '#8C4FFF',
  security: '#DD344C', // red — Security, Identity & Compliance
  messaging: '#E7157B', // pink — App Integration / Messaging
  integration: '#E7157B',
  analytics: '#8C4FFF',
  observability: '#E7157B', // pink — Management & Governance
  management: '#E7157B',
};

/** AWS "Smile" navy — fallback tint for any uncategorised service. */
const DEFAULT_COLOR = '#232F3E';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Darken a #rrggbb hex by `amount` (0..1) for the gradient's bottom stop. */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * The category a service belongs to, for colouring. Prefer the `icon:` path's
 * category segment (e.g. `aws/database/rds.svg` → `database`); fall back to the
 * abstract type's root (e.g. `database.relational` → `database`).
 */
export function categoryOf(iconPath?: string, abstractType?: string): string | undefined {
  if (iconPath) {
    const parts = iconPath.split('/');
    if (parts.length >= 2 && parts[1]) return parts[1];
  }
  if (abstractType) return abstractType.split('.')[0];
  return undefined;
}

/** A short, readable label for the tile: the key suffix, underscores stripped, up to 4 chars. */
function shortLabel(key: string): string {
  const suffix = key.split('.').pop() ?? key;
  return suffix.replace(/_/g, '').slice(0, 4).toUpperCase();
}

/** A 64×64 AWS-styled category tile for `key` — content for `image/svg+xml`. */
export function serviceIconSvg(key: string, category?: string): string {
  const base = (category && CATEGORY_COLOR[category]) ?? DEFAULT_COLOR;
  const top = base;
  const bottom = darken(base, 0.28);
  const label = shortLabel(key);
  const gradId = `g${label || 'x'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${escapeXml(key)}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="url(#${gradId})"/>
  <rect x="0.5" y="0.5" width="63" height="63" rx="11.5" fill="none" stroke="#ffffff" stroke-opacity="0.18"/>
  <text x="32" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;
}

/**
 * Back-compat alias retained for the icon endpoint's no-category fallback.
 * @deprecated prefer {@link serviceIconSvg} with a resolved category.
 */
export function placeholderSvg(key: string): string {
  return serviceIconSvg(key, categoryOf(undefined, key.split('.')[1]));
}
