import type { Connection } from '../generated/caml-types.js';
import type { ModelDiff, PropertyChange } from './diff.js';
import { diffIsEmpty, diffStats } from './diff.js';

const SECTIONS: { key: keyof Omit<ModelDiff, 'document'>; label: string }[] = [
  { key: 'components', label: 'Components' },
  { key: 'connections', label: 'Connections' },
  { key: 'groups', label: 'Groups' },
  { key: 'policies', label: 'Policies' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'deployments', label: 'Deployments' },
];

/** Render a diff the way a reviewer wants to read it — like a PR description. */
export function formatDiff(diff: ModelDiff): string {
  if (diffIsEmpty(diff)) return 'No changes.';

  const s = diffStats(diff);
  const parts = [`${s.added} added`, `${s.removed} removed`, `${s.modified} modified`];
  if (s.documentChanges > 0) parts.push(`${s.documentChanges} document`);
  const lines: string[] = [
    `${s.total} change${s.total === 1 ? '' : 's'}: ${parts.join(', ')}`,
  ];

  for (const { key, label } of SECTIONS) {
    const section = diff[key];
    if (section.added.length + section.removed.length + section.modified.length === 0) continue;
    lines.push('', `${label}:`);
    for (const el of section.added) lines.push(`  + ${describeElement(el)}`);
    for (const el of section.removed) lines.push(`  - ${describeElement(el)}`);
    for (const mod of section.modified) {
      lines.push(`  ~ ${mod.id}:`);
      for (const change of mod.changes) lines.push(`      ${formatChange(change)}`);
    }
  }

  if (diff.document.length > 0) {
    lines.push('', 'Document:');
    for (const change of diff.document) lines.push(`  ~ ${formatChange(change)}`);
  }

  return lines.join('\n');
}

interface ElementLike {
  id: string;
  name?: string;
  type?: string;
  kind?: string;
  from?: string;
  to?: string;
  environment?: string;
}

function describeElement(el: ElementLike): string {
  // Connections read as topology: "app-db app → db (data)"
  if (el.from !== undefined && el.to !== undefined) {
    const c = el as unknown as Connection;
    return `${c.id} ${c.from} → ${c.to} (${c.kind})`;
  }
  let out = el.id;
  if (el.name !== undefined) out += ` "${el.name}"`;
  const flavor = el.type ?? el.kind ?? el.environment;
  if (flavor !== undefined) out += ` (${flavor})`;
  return out;
}

function formatChange(change: PropertyChange): string {
  return `${change.path}: ${formatValue(change.before)} → ${formatValue(change.after)}`;
}

const MAX_VALUE_LENGTH = 60;

function formatValue(value: unknown): string {
  if (value === undefined) return '(none)';
  const text = JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}
