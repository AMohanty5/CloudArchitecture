import type { CamlComponent, ProjectableModel } from './projector';

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

/** Semantic commands (blueprint doc 06). Day 13: AddComponent; Day 14: SetProperty, Rename. */
export type Command =
  | { type: 'AddComponent'; component: CamlComponent }
  // value === undefined clears the property (back to its catalog default).
  | { type: 'SetProperty'; componentId: string; key: string; value: unknown }
  | { type: 'Rename'; componentId: string; name: string };

/** Apply a command to the model, returning a new model (never mutates the input). */
export function applyCommand(model: EditableModel, cmd: Command): EditableModel {
  switch (cmd.type) {
    case 'AddComponent':
      return { ...model, components: [...(model.components ?? []), cmd.component] };
    case 'SetProperty':
      return mapComponent(model, cmd.componentId, (c) => ({ ...c, properties: setKey(c.properties, cmd.key, cmd.value) }));
    case 'Rename':
      return mapComponent(model, cmd.componentId, (c) => ({ ...c, name: cmd.name }));
  }
}

/** Replace a component (by id) via `fn`, returning a new model; a no-op if absent. */
function mapComponent(model: EditableModel, id: string, fn: (c: CamlComponent) => CamlComponent): EditableModel {
  return { ...model, components: (model.components ?? []).map((c) => (c.id === id ? fn(c) : c)) };
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

/** A CAML-safe id (`^[a-z][a-z0-9-]{0,63}$`) from a service key + random suffix. */
export function makeComponentId(serviceKey: string): string {
  const base = (serviceKey.split('.').pop() ?? 'svc').replace(/[^a-z0-9]/g, '');
  const stem = /^[a-z]/.test(base) ? base : `n${base}`;
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}
