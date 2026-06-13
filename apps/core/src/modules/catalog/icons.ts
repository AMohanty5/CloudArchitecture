/**
 * Placeholder icon generator. Real provider icon packs are a Backlog item
 * (licensing review); until then every service gets a deterministic labelled
 * SVG tile so the palette and exports render something sensible.
 */

const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626'];

function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** A 64×64 rounded tile with the service's short label — content for image/svg+xml. */
export function placeholderSvg(key: string): string {
  const short = (key.split('.').pop() ?? key).slice(0, 4).toUpperCase();
  const fill = colorFor(key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${escapeXml(key)}">
  <rect width="64" height="64" rx="12" fill="${fill}"/>
  <text x="32" y="38" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(short)}</text>
</svg>`;
}
