import type { CamlDocument } from '../generated/caml-types.js';

/**
 * Canonical serialization — the basis of content addressing (blueprint doc 05).
 *
 * Rules (normative, mirrored in the schema's description):
 *  - object keys sorted lexicographically (by UTF-16 code unit)
 *  - arrays whose elements all carry a string `id` are sorted by that id;
 *    all other arrays keep their order (it is semantic, e.g. tags)
 *  - `annotations` are excluded (non-semantic by definition)
 *  - `undefined` values are dropped, exactly as JSON.stringify would
 *  - no insignificant whitespace; strings/numbers via JSON.stringify
 *    (numbers must be finite; strings compared by code points, no Unicode
 *    normalization — two visually identical but differently-composed strings
 *    are different content)
 *
 * Layout is not handled here: it is a commit sidecar, not part of CamlDocument.
 */
export function canonicalize(doc: CamlDocument): string {
  const semantic: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key !== 'annotations' && value !== undefined) semantic[key] = value;
  }
  return stringifyCanonical(semantic);
}

function stringifyCanonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`cannot canonicalize non-finite number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = isIdBearing(value) ? [...value].sort(byId) : value;
    return `[${items.map(stringifyCanonical).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stringifyCanonical(v)}`).join(',')}}`;
  }
  throw new TypeError(`cannot canonicalize value of type ${typeof value}`);
}

type IdBearing = { id: string };

function isIdBearing(arr: readonly unknown[]): arr is IdBearing[] {
  return (
    arr.length > 0 &&
    arr.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        typeof (item as Partial<IdBearing>).id === 'string',
    )
  );
}

function byId(a: IdBearing, b: IdBearing): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
