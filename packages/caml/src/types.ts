import type { CamlDocument, Component, Connection, Group } from './generated/caml-types.js';

/** O(1) lookups over a CAML document. Build once per document version. */
export interface ModelIndex {
  componentsById: ReadonlyMap<string, Component>;
  groupsById: ReadonlyMap<string, Group>;
  connectionsById: ReadonlyMap<string, Connection>;
  /** Direct children of each group (components placed in it, groups parented to it). */
  childrenByGroup: ReadonlyMap<string, { components: Component[]; groups: Group[] }>;
  /** Connections touching a component/group id, in either direction. */
  connectionsByEndpoint: ReadonlyMap<string, Connection[]>;
}

export function indexModel(doc: CamlDocument): ModelIndex {
  const componentsById = new Map((doc.components ?? []).map((c) => [c.id, c]));
  const groupsById = new Map((doc.groups ?? []).map((g) => [g.id, g]));
  const connectionsById = new Map((doc.connections ?? []).map((c) => [c.id, c]));

  const childrenByGroup = new Map<string, { components: Component[]; groups: Group[] }>();
  const bucket = (groupId: string): { components: Component[]; groups: Group[] } => {
    let b = childrenByGroup.get(groupId);
    if (!b) {
      b = { components: [], groups: [] };
      childrenByGroup.set(groupId, b);
    }
    return b;
  };
  for (const c of doc.components ?? []) {
    if (c.group !== undefined) bucket(c.group).components.push(c);
  }
  for (const g of doc.groups ?? []) {
    if (g.parent !== undefined) bucket(g.parent).groups.push(g);
  }

  const connectionsByEndpoint = new Map<string, Connection[]>();
  for (const cn of doc.connections ?? []) {
    const endpoints = cn.from === cn.to ? [cn.from] : [cn.from, cn.to];
    for (const end of endpoints) {
      const list = connectionsByEndpoint.get(end);
      if (list) list.push(cn);
      else connectionsByEndpoint.set(end, [cn]);
    }
  }

  return { componentsById, groupsById, connectionsById, childrenByGroup, connectionsByEndpoint };
}
