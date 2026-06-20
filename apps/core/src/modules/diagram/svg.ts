import type { CamlDocument, Component, Group } from '@cac/caml';
import { categoryOf, serviceIconSvg } from '../catalog/icons';

/**
 * Server-side SVG serializer (blueprint doc 06 derivation layer): a CAML model →
 * a standalone, presentation-ready SVG with true-vector nodes, nested containers,
 * kind-styled arrowhead edges, and the same category glyph icons the canvas shows.
 * Pure + deterministic — the auto-layout and styling mirror the canvas projector /
 * theme (Stage G) so on-screen and exported diagrams agree. Section panels (rowified
 * `tier` groups) and ELK routing are canvas-only refinements not reproduced here.
 */

export type SvgTheme = 'light' | 'dark';

// Geometry mirrors the canvas projector (theme.NODE + projector PAD/HEADER/GAP).
const NODE_W = 172;
const NODE_H = 54;
const PAD = 14;
const HEADER = 34;
const GAP = 12;
const MARGIN = 24;

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  service?: string;
  type?: string;
}
interface GroupBox extends Box {
  kind: string;
  depth: number;
}

const THEME: Record<SvgTheme, { bg: string; node: string; nodeBorder: string; text: string; sub: string }> = {
  light: { bg: '#ffffff', node: '#ffffff', nodeBorder: '#e5e7eb', text: '#1e293b', sub: '#94a3b8' },
  dark: { bg: '#0f172a', node: '#1e293b', nodeBorder: '#334155', text: '#e2e8f0', sub: '#94a3b8' },
};

/** Accent per group kind — mirrors theme.KIND_COLOR on the web. */
const KIND_COLOR: Record<string, string> = {
  region: '#8b5cf6',
  network: '#2563eb',
  subnet: '#0d9488',
  zone: '#d97706',
  tier: '#6366f1',
  domain: '#db2777',
  account: '#0891b2',
  cluster: '#7c3aed',
  custom: '#475569',
};
const DEFAULT_KIND = '#64748b';

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

interface EdgeStyle {
  stroke: string;
  dash?: string;
}
const EDGE_STYLE: Record<string, EdgeStyle> = {
  traffic: { stroke: '#2563eb' },
  data: { stroke: '#059669', dash: '6 4' },
  async: { stroke: '#7c3aed', dash: '2 4' },
  replication: { stroke: '#0891b2', dash: '6 4' },
  dependency: { stroke: '#64748b', dash: '1 5' },
};
const DEFAULT_EDGE: EdgeStyle = { stroke: '#94a3b8' };

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Humanized role subtitle from an abstract type leaf (e.g. database.relational → "Relational"). */
function roleSub(type?: string): string {
  if (!type) return '';
  const leaf = (type.split('.').pop() ?? type).replace(/_/g, ' ');
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

/** Lay the model out into absolute group + component boxes, mirroring the canvas projector. */
function layout(model: CamlDocument): { groups: GroupBox[]; components: Box[]; width: number; height: number } {
  const groupsByParent = new Map<string | undefined, Group[]>();
  for (const g of model.groups ?? []) {
    const list = groupsByParent.get(g.parent) ?? [];
    list.push(g);
    groupsByParent.set(g.parent, list);
  }
  const componentsByGroup = new Map<string | undefined, Component[]>();
  for (const c of model.components ?? []) {
    const list = componentsByGroup.get(c.group) ?? [];
    list.push(c);
    componentsByGroup.set(c.group, list);
  }

  const groups: GroupBox[] = [];
  const components: Box[] = [];

  function place(parentId: string | undefined, originX: number, originY: number, depth: number): { w: number; h: number } {
    const startX = parentId === undefined ? originX : originX + PAD;
    let y = (parentId === undefined ? originY : originY + HEADER + PAD) - GAP;
    let maxRight = startX + NODE_W;

    for (const g of groupsByParent.get(parentId) ?? []) {
      y += GAP;
      const gx = startX;
      const gy = y;
      const size = place(g.id, gx, gy, depth + 1);
      groups.push({ id: g.id, x: gx, y: gy, w: size.w, h: size.h, label: g.name, kind: g.kind, depth });
      y += size.h;
      maxRight = Math.max(maxRight, gx + size.w);
    }
    for (const c of componentsByGroup.get(parentId) ?? []) {
      y += GAP;
      components.push({ id: c.id, x: startX, y, w: NODE_W, h: NODE_H, label: c.name, service: c.binding?.service, type: c.type });
      y += NODE_H;
      maxRight = Math.max(maxRight, startX + NODE_W);
    }

    const w = Math.max(maxRight - originX + (parentId ? PAD : 0), NODE_W + 2 * PAD);
    const h = y - originY + (parentId ? PAD : 0);
    return { w, h };
  }

  place(undefined, MARGIN, MARGIN, 0);

  let width = MARGIN;
  let height = MARGIN;
  for (const b of [...groups, ...components]) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  return { groups, components, width: width + MARGIN, height: height + MARGIN };
}

/** Embed the catalog category glyph icon at (x,y), scaled to 30×30. */
function iconAt(service: string | undefined, type: string | undefined, id: string, x: number, y: number): string {
  if (!service) return `<rect x="${x}" y="${y}" width="30" height="30" rx="7" fill="#f1f5f9"/>`;
  const inner = serviceIconSvg(service, categoryOf(undefined, type), id);
  return `<svg x="${x}" y="${y}" width="30" height="30" viewBox="0 0 64 64">${inner}</svg>`;
}

/** Render a CAML model as a standalone SVG document string. */
export function renderSvg(model: CamlDocument, opts: { theme?: SvgTheme } = {}): string {
  const t = THEME[opts.theme ?? 'light'];
  const { groups, components, width, height } = layout(model);
  const byId = new Map<string, Box>([...groups, ...components].map((b) => [b.id, b]));

  // One arrowhead marker per distinct edge colour.
  const colors = new Set<string>([DEFAULT_EDGE.stroke, ...Object.values(EDGE_STYLE).map((e) => e.stroke)]);
  const markers = [...colors]
    .map(
      (c) =>
        `<marker id="ah-${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`,
    )
    .join('');

  const parts: string[] = [];

  // Groups: parents first (lower depth) so children stack on top. Coloured header band + tinted body.
  for (const g of [...groups].sort((a, b) => a.depth - b.depth)) {
    const base = KIND_COLOR[g.kind] ?? DEFAULT_KIND;
    parts.push(
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12" fill="${rgba(base, 0.035)}" stroke="${rgba(base, 0.45)}" stroke-width="1.5"/>` +
        `<path d="M${g.x} ${g.y + 28} h${g.w}" stroke="${rgba(base, 0.2)}"/>` +
        `<rect x="${g.x + 1}" y="${g.y + 1}" width="${g.w - 2}" height="27" rx="11" fill="${rgba(base, 0.1)}"/>` +
        `<text x="${g.x + 12}" y="${g.y + 19}" font-size="11" font-weight="700" letter-spacing="0.4" fill="${base}">${esc(truncate(g.label, 26))}</text>` +
        `<text x="${g.x + g.w - 12}" y="${g.y + 19}" font-size="10" fill="${rgba(base, 0.7)}" text-anchor="end">${esc(g.kind)}</text>`,
    );
  }

  // Edges (component centres, source-right → target-left) with arrowheads, drawn under nodes.
  for (const c of model.connections ?? []) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const style = EDGE_STYLE[c.kind] ?? DEFAULT_EDGE;
    const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : '';
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${style.stroke}" stroke-width="1.75"${dash} marker-end="url(#ah-${style.stroke.slice(1)})"/>`,
    );
  }

  // Components (on top): compact card + glyph icon + name + role subtitle.
  for (const c of components) {
    parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="10" fill="${t.node}" stroke="${t.nodeBorder}"/>`);
    parts.push(iconAt(c.service, c.type, c.id, c.x + 9, c.y + 12));
    parts.push(
      `<text x="${c.x + 48}" y="${c.y + 24}" font-size="12" font-weight="600" fill="${t.text}">${esc(truncate(c.label, 16))}</text>`,
    );
    const sub = roleSub(c.type);
    if (sub) parts.push(`<text x="${c.x + 48}" y="${c.y + 38}" font-size="9.5" fill="${t.sub}">${esc(truncate(sub, 20))}</text>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">` +
    `<defs>${markers}</defs>` +
    `<rect width="${width}" height="${height}" fill="${t.bg}"/>` +
    parts.join('') +
    `</svg>`
  );
}
