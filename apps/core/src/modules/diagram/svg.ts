import type { CamlDocument, Component, Group } from '@cac/caml';

/**
 * Server-side SVG serializer (blueprint doc 06 derivation layer): a CAML model →
 * a standalone, presentation-ready SVG with true-vector nodes, nested containers,
 * kind-styled edges, and inline icon tiles. Pure + deterministic — the auto-layout
 * mirrors the canvas projector (same nested-box geometry) so on-screen and exported
 * diagrams agree. ELK-quality routing is a later refinement.
 */

export type SvgTheme = 'light' | 'dark';

const NODE_W = 190;
const NODE_H = 64;
const PAD = 18;
const HEADER = 30;
const GAP = 18;
const MARGIN = 24;

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
}
interface GroupBox extends Box {
  kind: string;
  depth: number;
}

const THEME: Record<SvgTheme, { bg: string; node: string; nodeBorder: string; text: string; sub: string }> = {
  light: { bg: '#ffffff', node: '#ffffff', nodeBorder: '#cbd5e1', text: '#1e293b', sub: '#64748b' },
  dark: { bg: '#0f172a', node: '#1e293b', nodeBorder: '#334155', text: '#e2e8f0', sub: '#94a3b8' },
};

const GROUP_TINT: Record<string, { fill: string; stroke: string; fg: string }> = {
  network: { fill: 'rgba(37,99,235,0.10)', stroke: '#bfdbfe', fg: '#1d4ed8' },
  subnet: { fill: 'rgba(13,148,136,0.10)', stroke: '#99f6e4', fg: '#0f766e' },
  region: { fill: 'rgba(124,58,237,0.10)', stroke: '#ddd6fe', fg: '#6d28d9' },
  zone: { fill: 'rgba(217,119,6,0.10)', stroke: '#fde68a', fg: '#b45309' },
};
const DEFAULT_TINT = { fill: 'rgba(148,163,184,0.10)', stroke: '#e2e8f0', fg: '#475569' };

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

const ICON_PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626'];

function iconColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ICON_PALETTE[hash % ICON_PALETTE.length]!;
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
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

  // Lay out the children of `parentId` whose content area starts at (originX, originY).
  function place(parentId: string | undefined, originX: number, originY: number, depth: number): { w: number; h: number } {
    const startX = parentId === undefined ? originX : originX + PAD;
    let y = (parentId === undefined ? originY : originY + HEADER + PAD) - GAP;
    let maxRight = startX + NODE_W;

    for (const g of groupsByParent.get(parentId) ?? []) {
      y += GAP;
      const gx = startX;
      const gy = y;
      const size = place(g.id, gx, gy, depth + 1);
      groups.push({ id: g.id, x: gx, y: gy, w: size.w, h: size.h, label: g.name, sub: g.kind, kind: g.kind, depth });
      y += size.h;
      maxRight = Math.max(maxRight, gx + size.w);
    }
    for (const c of componentsByGroup.get(parentId) ?? []) {
      y += GAP;
      components.push({ id: c.id, x: startX, y, w: NODE_W, h: NODE_H, label: c.name, sub: c.binding?.service ?? c.type });
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

function iconTile(serviceKey: string, x: number, y: number): string {
  const short = (serviceKey.split('.').pop() ?? serviceKey).slice(0, 4).toUpperCase();
  const fill = iconColor(serviceKey);
  return `<rect x="${x}" y="${y}" width="26" height="26" rx="6" fill="${fill}"/><text x="${x + 13}" y="${y + 17}" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">${esc(short)}</text>`;
}

/** Render a CAML model as a standalone SVG document string. */
export function renderSvg(model: CamlDocument, opts: { theme?: SvgTheme } = {}): string {
  const t = THEME[opts.theme ?? 'light'];
  const { groups, components, width, height } = layout(model);
  const byId = new Map<string, Box>([...groups, ...components].map((b) => [b.id, b]));

  const parts: string[] = [];

  // Groups: parents first (lower depth) so children stack on top.
  for (const g of [...groups].sort((a, b) => a.depth - b.depth)) {
    const tint = GROUP_TINT[g.kind] ?? DEFAULT_TINT;
    parts.push(
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12" fill="${tint.fill}" stroke="${tint.stroke}"/>` +
        `<text x="${g.x + 12}" y="${g.y + 19}" font-size="12" font-weight="600" fill="${tint.fg}">${esc(truncate(g.label, 28))} · ${esc(g.kind)}</text>`,
    );
  }

  // Edges (component centres, source-right → target-left), drawn under the nodes.
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
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${style.stroke}" stroke-width="1.5"${dash}/>`);
    parts.push(
      `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" font-size="10" fill="${style.stroke}" text-anchor="middle">${esc(c.kind)}</text>`,
    );
  }

  // Components (on top).
  for (const c of components) {
    parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="10" fill="${t.node}" stroke="${t.nodeBorder}"/>`);
    parts.push(iconTile(c.sub, c.x + 10, c.y + 10));
    parts.push(
      `<text x="${c.x + 46}" y="${c.y + 26}" font-size="13" font-weight="600" fill="${t.text}">${esc(truncate(c.label, 18))}</text>`,
    );
    parts.push(`<text x="${c.x + 46}" y="${c.y + 44}" font-size="10" fill="${t.sub}">${esc(truncate(c.sub, 22))}</text>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">` +
    `<rect width="${width}" height="${height}" fill="${t.bg}"/>` +
    parts.join('') +
    `</svg>`
  );
}
