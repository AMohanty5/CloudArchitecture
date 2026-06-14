import type { CamlComponent, CamlConnection, CamlGroup, ProjectableModel } from './projector';
import { makeComponentId } from './commands';
import { makeConnectionId } from './connections';

/** Clipboard MIME for a copied CAML sub-graph (blueprint doc 06). */
export const CAML_FRAGMENT_MIME = 'application/x-caml+json';

export interface CamlFragment {
  __caml: 'fragment-v1';
  components: CamlComponent[];
  connections: CamlConnection[];
  groups: CamlGroup[];
}

/**
 * Build a copy fragment from the selected node. A component copies just itself; a
 * group copies its whole subtree (descendant groups + their components) plus the
 * connections whose endpoints are both inside the subtree. Returns null if nothing
 * copyable is selected.
 */
export function buildFragment(model: ProjectableModel, selectedId: string | undefined): CamlFragment | null {
  if (!selectedId) return null;
  const allComponents = model.components ?? [];
  const allGroups = model.groups ?? [];

  const component = allComponents.find((c) => c.id === selectedId);
  if (component) {
    return { __caml: 'fragment-v1', components: [component], connections: [], groups: [] };
  }

  const root = allGroups.find((g) => g.id === selectedId);
  if (!root) return null;

  // Collect the group subtree (root + descendants).
  const groupIds = new Set<string>([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of allGroups) {
      if (g.parent && groupIds.has(g.parent) && !groupIds.has(g.id)) {
        groupIds.add(g.id);
        grew = true;
      }
    }
  }
  const groups = allGroups.filter((g) => groupIds.has(g.id));
  const components = allComponents.filter((c) => c.group && groupIds.has(c.group));
  const componentIds = new Set(components.map((c) => c.id));
  const connections = (model.connections ?? []).filter((c) => componentIds.has(c.from) && componentIds.has(c.to));
  return { __caml: 'fragment-v1', components, connections, groups };
}

/** Parse text from the clipboard into a fragment, or null if it isn't one of ours. */
export function parseFragment(text: string): CamlFragment | null {
  try {
    const v = JSON.parse(text) as CamlFragment;
    if (v?.__caml === 'fragment-v1' && Array.isArray(v.components) && Array.isArray(v.groups) && Array.isArray(v.connections)) {
      return v;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/**
 * Re-map every id in a fragment to a fresh one and rewire all references
 * (component.group, group.parent, connection.from/to). References that point
 * outside the fragment are dropped, so the paste lands cleanly at the top level.
 */
export function remapFragment(frag: CamlFragment): CamlFragment {
  const idMap = new Map<string, string>();
  for (const g of frag.groups) idMap.set(g.id, makeComponentId(g.provider ? `${g.provider}.${g.kind}` : g.kind));
  for (const c of frag.components) idMap.set(c.id, makeComponentId(c.binding?.service ?? c.type));

  const groups = frag.groups.map((g) => {
    const next: CamlGroup = { ...g, id: idMap.get(g.id)! };
    const parent = g.parent ? idMap.get(g.parent) : undefined;
    if (parent) next.parent = parent;
    else delete next.parent;
    return next;
  });
  const components = frag.components.map((c) => {
    const next: CamlComponent = { ...c, id: idMap.get(c.id)! };
    const group = c.group ? idMap.get(c.group) : undefined;
    if (group) next.group = group;
    else delete next.group;
    return next;
  });
  const connections = frag.connections
    .filter((c) => idMap.has(c.from) && idMap.has(c.to))
    .map((c): CamlConnection => ({ ...c, id: makeConnectionId(), from: idMap.get(c.from)!, to: idMap.get(c.to)! }));

  return { __caml: 'fragment-v1', components, connections, groups };
}
