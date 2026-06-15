/**
 * A tiny HCL writer (blueprint doc 03 §3.9 IaC generation). Just enough to emit
 * Terraform resource/provider blocks deterministically: quoted strings, raw
 * expressions (refs like `aws_vpc.main.id`), numbers, bools, lists, and nested
 * unlabelled blocks. Not a general HCL library — purpose-built for the generator.
 */

export interface HclRef {
  __ref: string;
}
export type HclValue = string | number | boolean | HclRef | HclValue[];

/** A raw HCL expression emitted unquoted (resource references, function calls). */
export function ref(expression: string): HclRef {
  return { __ref: expression };
}

export interface HclBlock {
  type: string; // 'resource' | 'provider' | 'terraform' | 'variable' | nested e.g. 'launch_template'
  labels?: string[]; // ['aws_vpc', 'main'] — empty for nested blocks
  attrs?: Record<string, HclValue | undefined>; // undefined values are skipped
  blocks?: HclBlock[]; // nested blocks
}

function isRef(v: HclValue): v is HclRef {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && '__ref' in v;
}

function emitValue(v: HclValue): string {
  if (isRef(v)) return v.__ref;
  if (Array.isArray(v)) return `[${v.map(emitValue).join(', ')}]`;
  if (typeof v === 'string') return JSON.stringify(v); // double-quoted, escaped — valid HCL
  return String(v); // number | boolean
}

function pad(indent: number): string {
  return '  '.repeat(indent);
}

export function emit(block: HclBlock, indent = 0): string {
  const labels = (block.labels ?? []).map((l) => `"${l}"`).join(' ');
  const header = `${block.type}${labels ? ` ${labels}` : ''} {`;
  const lines: string[] = [`${pad(indent)}${header}`];

  for (const [key, value] of Object.entries(block.attrs ?? {})) {
    if (value === undefined) continue;
    lines.push(`${pad(indent + 1)}${key} = ${emitValue(value)}`);
  }
  for (const nested of block.blocks ?? []) {
    lines.push(emit(nested, indent + 1));
  }
  lines.push(`${pad(indent)}}`);
  return lines.join('\n');
}

/** Emit a sequence of top-level blocks separated by blank lines. */
export function emitAll(blocks: HclBlock[]): string {
  return blocks.map((b) => emit(b)).join('\n\n') + '\n';
}
