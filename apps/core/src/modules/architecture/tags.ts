/**
 * Tag normalization for the Architecture Hub. Tags are free-form but stored canonically so
 * filter/search/grouping is predictable: trimmed, lowercased, de-duped, bounded in size.
 * Pure (no DB) so it is unit-tested in isolation and reused by the service on every PATCH.
 */
export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 32;

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
