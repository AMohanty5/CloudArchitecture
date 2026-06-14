import type { CamlComponent, CamlConnection, CamlGroup, ProjectableModel } from './projector';

/** drag-and-drop MIME carrying a JSON-encoded catalog service from palette → canvas. */
export const SERVICE_DRAG_MIME = 'application/x-caml-service';

/** The editable model the canvas holds (full CAML doc; extra fields pass through). */
export interface EditableModel extends ProjectableModel {
  [key: string]: unknown;
}

/** A palette item (subset of the catalog ServiceSummary the API returns). */
export interface ServiceLike {
  key: string;
  name: string;
  provider: string;
  abstractTypes?: string[];
  groupKind?: string;
}

/**
 * Semantic commands (blueprint doc 06). Day 13: AddComponent; Day 14: SetProperty,
 * Rename; Day 15: Connect/Disconnect/SetConnection*; Day 16: groups & containment.
 */
export type Command =
  | { type: 'AddComponent'; component: CamlComponent }
  // value === undefined clears the property (back to its catalog default).
  | { type: 'SetProperty'; componentId: string; key: string; value: unknown }
  | { type: 'Rename'; componentId: string; name: string }
  | { type: 'Connect'; connection: CamlConnection }
  | { type: 'Disconnect'; connectionId: string }
  | { type: 'SetConnectionKind'; connectionId: string; kind: string }
  | { type: 'SetConnectionProperty'; connectionId: string; key: string; value: unknown }
  | { type: 'AddGroup'; group: CamlGroup }
  // group === undefined moves the component to the top level.
  | { type: 'MoveToGroup'; componentId: string; group: string | undefined }
  | { type: 'MoveGroup'; groupId: string; parent: string | undefined }
  | { type: 'RenameGroup'; groupId: string; name: string }
  | { type: 'SetGroupProperty'; groupId: string; key: string; value: unknown };

/** Apply a command to the model, returning a new model (never mutates the input). */
export function applyCommand(model: EditableModel, cmd: Command): EditableModel {
  switch (cmd.type) {
    case 'AddComponent':
      return { ...model, components: [...(model.components ?? []), cmd.component] };
    case 'SetProperty':
      return mapComponent(model, cmd.componentId, (c) => ({ ...c, properties: setKey(c.properties, cmd.key, cmd.value) }));
    case 'Rename':
      return mapComponent(model, cmd.componentId, (c) => ({ ...c, name: cmd.name }));
    case 'Connect':
      return { ...model, connections: [...(model.connections ?? []), cmd.connection] };
    case 'Disconnect':
      return { ...model, connections: (model.connections ?? []).filter((c) => c.id !== cmd.connectionId) };
    case 'SetConnectionKind':
      return mapConnection(model, cmd.connectionId, (c) => ({ ...c, kind: cmd.kind }));
    case 'SetConnectionProperty':
      return mapConnection(model, cmd.connectionId, (c) => ({
        ...c,
        properties: setKey(c.properties, cmd.key, cmd.value) as CamlConnection['properties'],
      }));
    case 'AddGroup':
      return { ...model, groups: [...(model.groups ?? []), cmd.group] };
    case 'MoveToGroup':
      return mapComponent(model, cmd.componentId, (c) => withOptional(c, 'group', cmd.group));
    case 'MoveGroup':
      return mapGroup(model, cmd.groupId, (g) => withOptional(g, 'parent', cmd.parent));
    case 'RenameGroup':
      return mapGroup(model, cmd.groupId, (g) => ({ ...g, name: cmd.name }));
    case 'SetGroupProperty':
      return mapGroup(model, cmd.groupId, (g) => ({ ...g, properties: setKey(g.properties, cmd.key, cmd.value) }));
  }
}

/** Replace a group (by id) via `fn`, returning a new model; a no-op if absent. */
function mapGroup(model: EditableModel, id: string, fn: (g: CamlGroup) => CamlGroup): EditableModel {
  return { ...model, groups: (model.groups ?? []).map((g) => (g.id === id ? fn(g) : g)) };
}

/** Set an optional field to `value`, or delete it when `value` is undefined (no empty key left behind). */
function withOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Replace a component (by id) via `fn`, returning a new model; a no-op if absent. */
function mapComponent(model: EditableModel, id: string, fn: (c: CamlComponent) => CamlComponent): EditableModel {
  return { ...model, components: (model.components ?? []).map((c) => (c.id === id ? fn(c) : c)) };
}

/** Replace a connection (by id) via `fn`, returning a new model; a no-op if absent. */
function mapConnection(model: EditableModel, id: string, fn: (c: CamlConnection) => CamlConnection): EditableModel {
  return { ...model, connections: (model.connections ?? []).map((c) => (c.id === id ? fn(c) : c)) };
}

/** Immutable property set; `undefined` deletes the key, dropping `properties` entirely when empty. */
function setKey(
  props: Record<string, unknown> | undefined,
  key: string,
  value: unknown,
): Record<string, unknown> | undefined {
  const next = { ...props };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Build a CAML component from a dragged catalog service. Returns null for
 * group-kind services (vpc/subnet) — dropping those creates groups (Day 16).
 */
export function componentFromService(service: ServiceLike, id: string): CamlComponent | null {
  const type = service.abstractTypes?.[0];
  if (!type) return null;
  return { id, type, name: service.name, binding: { provider: service.provider, service: service.key } };
}

/**
 * Build a CAML group from a dragged group-kind catalog service (vpc → network,
 * subnet → subnet). Returns null for component services. `parent` nests it.
 */
export function groupFromService(service: ServiceLike, id: string, parent?: string): CamlGroup | null {
  if (!service.groupKind) return null;
  const group: CamlGroup = { id, kind: service.groupKind, name: service.name, provider: service.provider };
  if (parent) group.parent = parent;
  return group;
}

/** A CAML-safe id (`^[a-z][a-z0-9-]{0,63}$`) from a service key + random suffix. */
export function makeComponentId(serviceKey: string): string {
  const base = (serviceKey.split('.').pop() ?? 'svc').replace(/[^a-z0-9]/g, '');
  const stem = /^[a-z]/.test(base) ? base : `n${base}`;
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}
