import { useCallback, useEffect, useRef, useState } from 'react';
import { client, apiBase } from './client';
import { applyCommand, componentFromService, groupFromService, makeComponentId } from '../canvas/commands';
import type { Command, EditableModel, ServiceLike } from '../canvas/commands';
import { project } from '../canvas/projector';
import type { CamlConnection, LayoutSidecar } from '../canvas/projector';
import { autoLayout } from '../canvas/layout';
import { canRedo as canRedoFn, canUndo as canUndoFn, initHistory, record, redo as redoFn, undo as undoFn } from '../canvas/history';
import type { History } from '../canvas/history';
import { remapFragment } from '../canvas/clipboard';
import type { CamlFragment } from '../canvas/clipboard';

export type SaveState = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';

/** A pass-1/pass-2 validation error from a rejected commit (problem+json `errors`). */
export interface CommitError {
  code: string;
  path?: string;
  element?: string;
  message: string;
}

type Position = { x: number; y: number };

/** Undoable editor state: the CAML model + its layout sidecar move together. */
interface EditorState {
  model: EditableModel;
  layout: LayoutSidecar;
}

export interface EditorApi {
  model: EditableModel | undefined;
  layout: LayoutSidecar;
  saveState: SaveState;
  tidying: boolean;
  /** Validation errors from the last rejected (422) commit; cleared on the next success. */
  errors: CommitError[];
  selectedId: string | undefined;
  selectedEdgeId: string | undefined;
  canUndo: boolean;
  canRedo: boolean;
  select: (id: string | undefined) => void;
  selectEdge: (id: string | undefined) => void;
  undo: () => void;
  redo: () => void;
  tidyUp: () => Promise<void>;
  /** Add a component; `group` nests it (and skips the free-position sidecar entry). */
  addComponent: (service: ServiceLike, position: Position, group?: string) => void;
  setProperty: (componentId: string, key: string, value: unknown) => void;
  rename: (componentId: string, name: string) => void;
  connect: (connection: CamlConnection) => void;
  disconnect: (connectionId: string) => void;
  setConnectionKind: (connectionId: string, kind: string) => void;
  setConnectionProperty: (connectionId: string, key: string, value: unknown) => void;
  /** Add a group from a group-kind service; `parent` nests it. */
  addGroup: (service: ServiceLike, position: Position, parent?: string) => void;
  moveToGroup: (componentId: string, group: string | undefined) => void;
  moveGroup: (groupId: string, parent: string | undefined) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupProperty: (groupId: string, key: string, value: unknown) => void;
  removeComponent: (componentId: string) => void;
  removeGroup: (groupId: string) => void;
  duplicate: (componentId: string) => void;
  nudge: (nodeId: string, dx: number, dy: number) => void;
  paste: (fragment: CamlFragment) => void;
  /** Restore an older commit's model as a new head commit (never a history rewrite). */
  restore: (model: EditableModel) => void;
}

const DEBOUNCE_MS = 700;
const EMPTY_LAYOUT: LayoutSidecar = {};

/** Fetch the persisted layout sidecar for a branch head (raw — endpoint post-dates the generated client). */
async function fetchLayout(id: string, branch: string): Promise<LayoutSidecar> {
  try {
    const res = await fetch(`${apiBase}/architectures/${id}/branches/${branch}/layout`);
    if (!res.ok) return EMPTY_LAYOUT;
    const body = (await res.json()) as { layout?: LayoutSidecar | null };
    return body.layout ?? EMPTY_LAYOUT;
  } catch {
    return EMPTY_LAYOUT;
  }
}

/** The undo/redo coalescing key for a command (rapid same-field edits → one entry). */
function commandGroupKey(cmd: Command): string | undefined {
  switch (cmd.type) {
    case 'SetProperty':
      return `prop:${cmd.componentId}:${cmd.key}`;
    case 'Rename':
      return `rename:${cmd.componentId}`;
    case 'SetConnectionProperty':
      return `connprop:${cmd.connectionId}:${cmd.key}`;
    case 'SetConnectionKind':
      return `connkind:${cmd.connectionId}`;
    case 'SetGroupProperty':
      return `gprop:${cmd.groupId}:${cmd.key}`;
    case 'RenameGroup':
      return `grename:${cmd.groupId}`;
    case 'MoveToGroup':
      return `move:${cmd.componentId}`;
    case 'MoveGroup':
      return `gmove:${cmd.groupId}`;
    default:
      return undefined; // Add*/Remove*/Connect/Disconnect = discrete entries
  }
}

/** Immutable position set in a layout sidecar. */
function withPosition(layout: LayoutSidecar, id: string, pos: Position): LayoutSidecar {
  return { ...layout, positions: { ...layout.positions, [id]: pos } };
}

/**
 * Canvas editor state (CommandBus v1 + local undo/redo, blueprint doc 06). Model and
 * layout move together through a history-backed present; a debounced micro-commit
 * persists it. 409 reloads from the server; 422 rolls back to the committed model.
 * "Tidy up" computes an ELK layout (Web Worker) and records it as one undoable step.
 */
export function useEditor(id: string, branch = 'main'): EditorApi {
  const [model, setModel] = useState<EditableModel>();
  const [layout, setLayout] = useState<LayoutSidecar>(EMPTY_LAYOUT);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [tidying, setTidying] = useState(false);
  const [errors, setErrors] = useState<CommitError[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>(undefined);

  const historyRef = useRef<History<EditorState> | null>(null);
  const modelRef = useRef<EditableModel | undefined>(undefined);
  const layoutRef = useRef<LayoutSidecar>(EMPTY_LAYOUT);
  const committedRef = useRef<EditableModel | undefined>(undefined);
  const headRef = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scheduleCommit = useCallback((commitFn: () => void) => {
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commitFn, DEBOUNCE_MS);
  }, []);

  // Reset the editing session to a known-good state (initial load, 409 rebase, 422 revert).
  const reset = useCallback((m: EditableModel, l: LayoutSidecar) => {
    historyRef.current = initHistory({ model: m, layout: l });
    modelRef.current = m;
    layoutRef.current = l;
    setModel(m);
    setLayout(l);
  }, []);

  const load = useCallback(async () => {
    const { data, error, response } = await client.GET('/architectures/{id}/branches/{branch}/model', {
      params: { path: { id, branch } },
    });
    if (error || !data) {
      setSaveState('error');
      return;
    }
    const m = data as EditableModel;
    committedRef.current = m;
    headRef.current = response.headers.get('etag') ?? undefined;
    const layout = await fetchLayout(id, branch); // hydrate persisted positions/sizes (Day 28)
    reset(m, layout);
    setSaveState('saved');
  }, [id, branch, reset]);

  useEffect(() => {
    setSaveState('loading');
    void load();
  }, [load]);

  const commit = useCallback(async () => {
    const current = modelRef.current;
    const parent = headRef.current;
    if (!current || !parent) return;
    setSaveState('saving');
    const { data, error, response } = await client.POST('/architectures/{id}/branches/{branch}/commits', {
      params: { path: { id, branch } },
      // model/layout are opaque (CamlDocument / sidecar) in the generated client → Record<string, never>.
      body: {
        expectedParent: parent,
        message: 'Canvas edit',
        model: current as Record<string, never>,
        layout: layoutRef.current as Record<string, never>,
      },
    });
    if (error || !data) {
      if (response?.status === 409) {
        setSaveState('conflict');
        await load(); // rebase onto server head (discards the optimistic change + history)
      } else {
        // 422 (invalid) or other: roll back to the last committed model and surface
        // the catalog/structural messages so the inspector can show them inline.
        setSaveState('error');
        setErrors((error as unknown as { errors?: CommitError[] } | undefined)?.errors ?? []);
        if (committedRef.current) reset(committedRef.current, layoutRef.current);
      }
      return;
    }
    headRef.current = (data as { hash: string }).hash;
    committedRef.current = current;
    setErrors([]);
    setSaveState('saved');
  }, [id, branch, load, reset]);

  // Commit a new present (model + layout) into history (coalescing on `key`) and schedule a save.
  const apply = useCallback(
    (nextModel: EditableModel, nextLayout: LayoutSidecar, key: string | undefined) => {
      const h = historyRef.current;
      if (!h) return;
      historyRef.current = record(h, { model: nextModel, layout: nextLayout }, key);
      modelRef.current = nextModel;
      layoutRef.current = nextLayout;
      setModel(nextModel);
      setLayout(nextLayout);
      scheduleCommit(() => void commit());
    },
    [commit, scheduleCommit],
  );

  const execute = useCallback(
    (cmd: Command) => {
      const base = modelRef.current;
      if (!base) return;
      apply(applyCommand(base, cmd), layoutRef.current, commandGroupKey(cmd));
    },
    [apply],
  );

  const restore = useCallback(
    (next: History<EditorState>) => {
      historyRef.current = next;
      modelRef.current = next.present.model;
      layoutRef.current = next.present.layout;
      setModel(next.present.model);
      setLayout(next.present.layout);
      scheduleCommit(() => void commit());
    },
    [commit, scheduleCommit],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h && canUndoFn(h)) restore(undoFn(h));
  }, [restore]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h && canRedoFn(h)) restore(redoFn(h));
  }, [restore]);

  const addComponent = useCallback(
    (service: ServiceLike, position: Position, group?: string) => {
      const componentId = makeComponentId(service.key);
      const component = componentFromService(service, componentId);
      if (!component) return; // group-kind services become groups (addGroup)
      if (group) component.group = group;
      const nextModel = applyCommand(modelRef.current!, { type: 'AddComponent', component });
      const nextLayout = group ? layoutRef.current : withPosition(layoutRef.current, componentId, position);
      apply(nextModel, nextLayout, undefined);
    },
    [apply],
  );

  const addGroup = useCallback(
    (service: ServiceLike, position: Position, parent?: string) => {
      const groupId = makeComponentId(service.key);
      const group = groupFromService(service, groupId, parent);
      if (!group) return; // component services become components (addComponent)
      const nextModel = applyCommand(modelRef.current!, { type: 'AddGroup', group });
      const nextLayout = parent ? layoutRef.current : withPosition(layoutRef.current, groupId, position);
      apply(nextModel, nextLayout, undefined);
    },
    [apply],
  );

  const duplicate = useCallback(
    (componentId: string) => {
      const source = modelRef.current?.components?.find((c) => c.id === componentId);
      if (!source) return;
      const newId = makeComponentId(source.binding?.service ?? source.type);
      const nextModel = applyCommand(modelRef.current!, { type: 'AddComponent', component: { ...source, id: newId } });
      const pos = layoutRef.current.positions?.[componentId];
      const nextLayout = pos ? withPosition(layoutRef.current, newId, { x: pos.x + 32, y: pos.y + 32 }) : layoutRef.current;
      apply(nextModel, nextLayout, undefined);
    },
    [apply],
  );

  const paste = useCallback(
    (fragment: CamlFragment) => {
      const base = modelRef.current;
      if (!base) return;
      const remapped = remapFragment(fragment);
      const cmds: Command[] = [
        ...remapped.groups.map((group): Command => ({ type: 'AddGroup', group })),
        ...remapped.components.map((component): Command => ({ type: 'AddComponent', component })),
        ...remapped.connections.map((connection): Command => ({ type: 'Connect', connection })),
      ];
      if (cmds.length === 0) return;
      const nextModel = cmds.reduce((m, c) => applyCommand(m, c), base);
      // Cascade top-level pasted nodes so they don't all land on the origin.
      let nextLayout = layoutRef.current;
      let i = 0;
      for (const g of remapped.groups) if (!g.parent) nextLayout = withPosition(nextLayout, g.id, { x: 60 + i++ * 28, y: 60 + i * 28 });
      for (const c of remapped.components) if (!c.group) nextLayout = withPosition(nextLayout, c.id, { x: 60 + i++ * 28, y: 60 + i * 28 });
      apply(nextModel, nextLayout, `paste:${Math.random()}`);
    },
    [apply],
  );

  const nudge = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      const base =
        layoutRef.current.positions?.[nodeId] ??
        project(modelRef.current ?? {}, layoutRef.current).nodes.find((n) => n.id === nodeId)?.position;
      if (!base) return;
      apply(modelRef.current!, withPosition(layoutRef.current, nodeId, { x: base.x + dx, y: base.y + dy }), `nudge:${nodeId}`);
    },
    [apply],
  );

  const tidyUp = useCallback(async () => {
    const current = modelRef.current;
    if (!current) return;
    setTidying(true);
    try {
      const { nodes, edges } = project(current, layoutRef.current);
      const sidecar = await autoLayout(nodes, edges);
      apply(modelRef.current!, sidecar, 'tidy'); // replace the whole layout in one undoable step
    } catch {
      /* layout failed — leave the current layout in place */
    } finally {
      setTidying(false);
    }
  }, [apply]);

  const moveToGroup = useCallback(
    (componentId: string, group: string | undefined) => execute({ type: 'MoveToGroup', componentId, group }),
    [execute],
  );
  const moveGroup = useCallback(
    (groupId: string, parent: string | undefined) => execute({ type: 'MoveGroup', groupId, parent }),
    [execute],
  );
  const renameGroup = useCallback((groupId: string, name: string) => execute({ type: 'RenameGroup', groupId, name }), [execute]);
  const setGroupProperty = useCallback(
    (groupId: string, key: string, value: unknown) => execute({ type: 'SetGroupProperty', groupId, key, value }),
    [execute],
  );
  const removeComponent = useCallback((componentId: string) => execute({ type: 'RemoveComponent', componentId }), [execute]);
  const removeGroup = useCallback((groupId: string) => execute({ type: 'RemoveGroup', groupId }), [execute]);

  // Restore = commit the old model as a new head (content-addressed → new commit, old hash).
  const restoreCommit = useCallback((restored: EditableModel) => apply(restored, layoutRef.current, undefined), [apply]);

  const setProperty = useCallback(
    (componentId: string, key: string, value: unknown) => execute({ type: 'SetProperty', componentId, key, value }),
    [execute],
  );
  const rename = useCallback((componentId: string, name: string) => execute({ type: 'Rename', componentId, name }), [execute]);
  const connect = useCallback((connection: CamlConnection) => execute({ type: 'Connect', connection }), [execute]);
  const disconnect = useCallback((connectionId: string) => execute({ type: 'Disconnect', connectionId }), [execute]);
  const setConnectionKind = useCallback(
    (connectionId: string, kind: string) => execute({ type: 'SetConnectionKind', connectionId, kind }),
    [execute],
  );
  const setConnectionProperty = useCallback(
    (connectionId: string, key: string, value: unknown) => execute({ type: 'SetConnectionProperty', connectionId, key, value }),
    [execute],
  );

  // Node and edge selection are mutually exclusive (one inspector at a time).
  const select = useCallback((nodeId: string | undefined) => {
    setSelectedId(nodeId);
    if (nodeId) setSelectedEdgeId(undefined);
  }, []);
  const selectEdge = useCallback((edgeId: string | undefined) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) setSelectedId(undefined);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const h = historyRef.current;
  return {
    model,
    layout,
    saveState,
    tidying,
    errors,
    selectedId,
    selectedEdgeId,
    canUndo: h ? canUndoFn(h) : false,
    canRedo: h ? canRedoFn(h) : false,
    select,
    selectEdge,
    undo,
    redo,
    tidyUp,
    addComponent,
    setProperty,
    rename,
    connect,
    disconnect,
    setConnectionKind,
    setConnectionProperty,
    addGroup,
    moveToGroup,
    moveGroup,
    renameGroup,
    setGroupProperty,
    removeComponent,
    removeGroup,
    duplicate,
    nudge,
    paste,
    restore: restoreCommit,
  };
}
