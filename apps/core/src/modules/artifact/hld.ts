import type { CamlDocument, Component, Group, Requirement } from '@cac/caml';
import { hashModel, indexModel } from '@cac/caml';

/**
 * CAML → High-Level Design markdown (blueprint doc 03, "HLD markdown export").
 * A reviewer-facing narrative of the architecture: overview, requirements, the
 * group/region/subnet topology as a nested tree, and component + connection
 * tables. Pure + deterministic — same model in, same document out (stamped with
 * the content hash so a doc is traceable to an exact commit). The sibling of the
 * SVG renderer and Terraform generator: one model, three derived artifacts.
 */

function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** A markdown table from a header row and body rows; '—' fills empty cells. */
function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => cell(c) || '—').join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function targets(req: Requirement): string {
  if (!req.quantity) return '';
  return Object.entries(req.quantity)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join('; ');
}

function scalingNote(c: Component): string {
  const s = c.scaling;
  if (!s || (s.mode === undefined && s.min === undefined && s.max === undefined)) return '';
  const range = s.min !== undefined || s.max !== undefined ? ` ${s.min ?? '?'}–${s.max ?? '?'}` : '';
  return `${s.mode ?? 'scaled'}${range}`;
}

export function renderHld(model: CamlDocument): string {
  const index = indexModel(model);
  const groups = model.groups ?? [];
  const components = model.components ?? [];
  const connections = model.connections ?? [];
  const requirements = model.requirements ?? [];
  const groupName = (id: string): string => index.groupsById.get(id)?.name ?? id;

  const out: string[] = [];
  out.push(`# ${model.name} — High-Level Design`);
  out.push('');
  out.push(`> Generated from CAML by Cloud Architect Copilot · content hash \`${hashModel(model).slice(0, 12)}\``);
  if (model.description) {
    out.push('');
    out.push(model.description);
  }

  // --- Overview ---
  const meta = model.metadata ?? {};
  out.push('', '## Overview', '');
  out.push(
    table(
      ['Field', 'Value'],
      [
        ['Owner', meta.owner ?? ''],
        ['Lifecycle', meta.lifecycle ?? ''],
        ['Catalog version', meta.catalogVersion ?? ''],
        ['Components', String(components.length)],
        ['Groups', String(groups.length)],
        ['Connections', String(connections.length)],
      ],
    ),
  );

  // --- Requirements ---
  if (requirements.length > 0) {
    out.push('', '## Requirements', '');
    out.push(
      table(
        ['Priority', 'Kind', 'Statement', 'Targets'],
        requirements.map((r) => [r.priority ?? '', r.kind, r.statement, targets(r)]),
      ),
    );
  }

  // --- Topology (nested group tree + the components inside each group) ---
  out.push('', '## Topology', '');
  const renderGroup = (g: Group, depth: number): void => {
    const pad = '  '.repeat(depth);
    out.push(`${pad}- **${g.name}** _(${g.kind})_`);
    const children = index.childrenByGroup.get(g.id);
    for (const child of children?.groups ?? []) renderGroup(child, depth + 1);
    for (const c of children?.components ?? []) out.push(`${pad}  - ${c.name} \`${c.binding?.service ?? c.type}\``);
  };
  const rootGroups = groups.filter((g) => g.parent === undefined);
  for (const g of rootGroups) renderGroup(g, 0);
  const ungrouped = components.filter((c) => c.group === undefined);
  for (const c of ungrouped) out.push(`- ${c.name} \`${c.binding?.service ?? c.type}\` _(ungrouped)_`);
  if (rootGroups.length === 0 && ungrouped.length === 0) out.push('_No elements._');

  // --- Components ---
  out.push('', '## Components', '');
  out.push(
    table(
      ['Name', 'Type', 'Service', 'Group', 'Scaling', 'Criticality'],
      components.map((c) => [
        c.name,
        c.type,
        c.binding?.service ?? '',
        c.group ? groupName(c.group) : '',
        scalingNote(c),
        c.criticality ?? '',
      ]),
    ),
  );

  // --- Connections ---
  if (connections.length > 0) {
    const label = (id: string): string => index.componentsById.get(id)?.name ?? groupName(id);
    out.push('', '## Connections', '');
    out.push(
      table(
        ['From → To', 'Kind', 'Protocol', 'Port', 'Encrypted'],
        connections.map((cn) => [
          `${label(cn.from)} → ${label(cn.to)}`,
          cn.kind,
          cn.properties?.protocol ?? '',
          cn.properties?.port !== undefined ? String(cn.properties.port) : '',
          cn.properties?.encrypted !== undefined ? (cn.properties.encrypted ? 'yes' : 'no') : '',
        ]),
      ),
    );
  }

  out.push('');
  return out.join('\n');
}
