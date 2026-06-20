/**
 * Service icon generator. The official AWS Architecture Icon pack is a Backlog
 * item (licensing review), so until that lands we render a deterministic
 * AWS-styled tile per service: a rounded square tinted by the service's
 * category (matching AWS's category colour scheme), a white category glyph
 * (compute = chip, database = cylinder, …), and the service's short label —
 * so the palette, canvas nodes, and exports read as recognisable AWS services.
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

/**
 * A short, readable label for the tile. Multi-word keys → initials (api_gateway → AG);
 * single words → first three letters (lambda → LAM, ec2 → EC2, s3 → S3).
 */
function shortLabel(key: string): string {
  const suffix = key.split('.').pop() ?? key;
  const words = suffix.split('_').filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]!).join('').slice(0, 4).toUpperCase();
  return suffix.slice(0, 3).toUpperCase();
}

// White stroke defaults shared by the line glyphs.
const S = 'fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

/** Per-category white glyph, drawn in the tile's upper area (~y 11–35). */
const GLYPHS: Record<string, string> = {
  compute: `<rect x="22" y="13" width="20" height="20" rx="3" ${S}/><rect x="28" y="19" width="8" height="8" rx="1.5" fill="#ffffff"/>`,
  database: `<ellipse cx="32" cy="14" rx="11" ry="4" ${S}/><path d="M21 14 v16 c0 2.2 4.9 4 11 4 s11 -1.8 11 -4 v-16" ${S}/>`,
  storage: `<rect x="22" y="14" width="20" height="18" rx="2" ${S}/><line x1="22" y1="20" x2="42" y2="20" ${S}/><line x1="32" y1="20" x2="32" y2="14" ${S}/>`,
  networking: `<circle cx="32" cy="23" r="3.5" fill="#ffffff"/><circle cx="20" cy="14" r="3" ${S}/><circle cx="44" cy="14" r="3" ${S}/><circle cx="32" cy="34" r="3" ${S}/><path d="M32 23 L21 16 M32 23 L43 16 M32 23 L32 31" ${S}/>`,
  security: `<path d="M32 11 l11 4 v7 c0 7.5 -5 11.5 -11 13.5 c-6 -2 -11 -6 -11 -13.5 v-7 z" ${S}/>`,
  messaging: `<rect x="20" y="15" width="24" height="17" rx="2.5" ${S}/><path d="M21 17 l11 9 l11 -9" ${S}/>`,
  integration: `<path d="M22 19 h16" ${S}/><path d="M34 15 l5 4 l-5 4" ${S}/><path d="M42 29 h-16" ${S}/><path d="M30 25 l-5 4 l5 4" ${S}/>`,
  analytics: `<rect x="22" y="24" width="5" height="10" rx="1" fill="#ffffff"/><rect x="29.5" y="17" width="5" height="17" rx="1" fill="#ffffff"/><rect x="37" y="21" width="5" height="13" rx="1" fill="#ffffff"/>`,
  observability: `<polyline points="19,24 26,24 29,15 35,33 38,24 45,24" ${S}/>`,
  default: `<circle cx="26" cy="18" r="2.6" fill="#ffffff"/><circle cx="38" cy="18" r="2.6" fill="#ffffff"/><circle cx="26" cy="30" r="2.6" fill="#ffffff"/><circle cx="38" cy="30" r="2.6" fill="#ffffff"/>`,
};

/** Map a colour-category to a glyph key (collapsing synonyms). */
function glyphKey(category?: string): string {
  switch (category) {
    case 'compute':
    case 'containers':
      return 'compute';
    case 'networking':
    case 'network':
      return 'networking';
    case 'observability':
    case 'management':
      return 'observability';
    case 'database':
    case 'storage':
    case 'security':
    case 'messaging':
    case 'integration':
    case 'analytics':
      return category;
    default:
      return 'default';
  }
}

/**
 * A 64×64 AWS-styled category tile for `key` — glyph + label — content for `image/svg+xml`.
 * `idSuffix` disambiguates the gradient id when many tiles are embedded in one document
 * (e.g. the server SVG export), keeping ids unique.
 */
export function serviceIconSvg(key: string, category?: string, idSuffix?: string): string {
  const base = (category && CATEGORY_COLOR[category]) ?? DEFAULT_COLOR;
  const bottom = darken(base, 0.28);
  const label = shortLabel(key);
  const glyph = GLYPHS[glyphKey(category)] ?? GLYPHS.default;
  const gradId = `g${glyphKey(category)}${idSuffix ? `-${idSuffix}` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${escapeXml(key)}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="url(#${gradId})"/>
  <rect x="0.5" y="0.5" width="63" height="63" rx="11.5" fill="none" stroke="#ffffff" stroke-opacity="0.18"/>
  ${glyph}
  <text x="32" y="53" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#ffffff" fill-opacity="0.92" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;
}

/**
 * Back-compat alias retained for the icon endpoint's no-category fallback.
 * @deprecated prefer {@link serviceIconSvg} with a resolved category.
 */
export function placeholderSvg(key: string): string {
  return serviceIconSvg(key, categoryOf(undefined, key.split('.')[1]));
}
