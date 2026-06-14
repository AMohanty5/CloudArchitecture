import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from './client';
import { applyCommand, componentFromService, groupFromService, makeComponentId } from '../canvas/commands';
import type { Command, EditableModel, ServiceLike } from '../canvas/commands';
import type { CamlConnection } from '../canvas/projector';

export type SaveState = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';

/** A pass-1/pass-2 validation error from a rejected commit (problem+json `errors`). */
export interface CommitError {
  code: string;
  path?: string;
  element?: string;
  message: string;
}

export interface EditorApi {
  model: EditableModel | undefined;
  layout: Record<string, { x: number; y: number }>;
  saveState: SaveState;
  /** Validation errors from the last rejected (422) commit; cleared on the next success. */
  errors: CommitError[];
  selectedId: string | undefined;
  selectedEdgeId: string | undefined;
  select: (id: string | undefined) => void;
  selectEdge: (id: string | undefined) => void;
  /** Add a component; `group` nests it (and skips the free-position sidecar entry). */
  addComponent: (service: ServiceLike, position: { x: number; y: number }, group?: string) => void;
  setProperty: (componentId: string, key: string, value: unknown) => void;
  rename: (componentId: string, name: string) => void;
  connect: (connection: CamlConnection) => void;
  disconnect: (connectionId: string) => void;
  setConnectionKind: (connectionId: string, kind: string) => void;
  setConnectionProperty: (connectionId: string, key: string, value: unknown) => void;
  /** Add a group from a group-kind service; `parent` nests it. */
  addGroup: (service: ServiceLike, position: { x: number; y: number }, parent?: string) => void;
  moveToGroup: (componentId: string, group: string | undefined) => void;
  moveGroup: (groupId: string, parent: string | undefined) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupProperty: (groupId: string, key: string, value: unknown) => void;
}

const DEBOUNCE_MS = 700;

/**
 * Canvas editor state (CommandBus v1, blueprint doc 06). Commands mutate a local
 * CAML doc optimistically; a debounced micro-commit persists it via the write
 * path. 409 (head moved) reloads from the server; 422 (invalid) rolls back to the
 * last committed model. Layout positions are client-side (sent as the commit's
 * layout sidecar). Refs back the debounced closure so it always sees latest state.
 */
export function useEditor(id: string, branch = 'main'): EditorApi {
  const [model, setModel] = useState<EditableModel>();
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>({});
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [errors, setErrors] = useState<CommitError[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>(undefined);

  const modelRef = useRef<EditableModel | undefined>(undefined);
  const committedRef = useRef<EditableModel | undefined>(undefined);
  const headRef = useRef<string | undefined>(undefined);
  const layoutRef = useRef<Record<string, { x: number; y: number }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error, response } = await client.GET('/architectures/{id}/branches/{branch}/model', {
      params: { path: { id, branch } },
    });
    if (error || !data) {
      setSaveState('error');
      return;
    }
    const m = data as EditableModel;
    modelRef.current = m;
    committedRef.current = m;
    headRef.current = response.headers.get('etag') ?? undefined;
    setModel(m);
    setSaveState('saved');
  }, [id, branch]);

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
        await load(); // rebase onto server head (discards the optimistic change)
      } else {
        // 422 (invalid) or other: roll back to the last committed model and surface
        // the catalog/structural messages so the inspector can show them inline.
        setSaveState('error');
        setErrors((error as unknown as { errors?: CommitError[] } | undefined)?.errors ?? []);
        const restored = committedRef.current;
        if (restored) {
          modelRef.current = restored;
          setModel(restored);
        }
      }
      return;
    }
    headRef.current = (data as { hash: string }).hash;
    committedRef.current = current;
    setErrors([]);
    setSaveState('saved');
  }, [id, branch, load]);

  const execute = useCallback(
    (cmd: Command) => {
      const base = modelRef.current;
      if (!base) return;
      const next = applyCommand(base, cmd);
      modelRef.current = next;
      setModel(next);
      setSaveState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void commit(), DEBOUNCE_MS);
    },
    [commit],
  );

  // Record a free (top-level) drop position in the layout sidecar. Nested elements are
  // omitted — the projector auto-lays-them-out inside their parent container.
  const remember = useCallback((nodeId: string, position: { x: number; y: number }) => {
    const next = { ...layoutRef.current, [nodeId]: position };
    layoutRef.current = next;
    setLayout(next);
  }, []);

  const addComponent = useCallback(
    (service: ServiceLike, position: { x: number; y: number }, group?: string) => {
      const componentId = makeComponentId(service.key);
      const component = componentFromService(service, componentId);
      if (!component) return; // group-kind services become groups (addGroup)
      if (group) component.group = group;
      else remember(componentId, position);
      execute({ type: 'AddComponent', component });
    },
    [execute, remember],
  );

  const addGroup = useCallback(
    (service: ServiceLike, position: { x: number; y: number }, parent?: string) => {
      const groupId = makeComponentId(service.key);
      const group = groupFromService(service, groupId, parent);
      if (!group) return; // component services become components (addComponent)
      if (!parent) remember(groupId, position);
      execute({ type: 'AddGroup', group });
    },
    [execute, remember],
  );

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

  const setProperty = useCallback(
    (componentId: string, key: string, value: unknown) => execute({ type: 'SetProperty', componentId, key, value }),
    [execute],
  );

  const rename = useCallback(
    (componentId: string, name: string) => execute({ type: 'Rename', componentId, name }),
    [execute],
  );

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

  return {
    model,
    layout,
    saveState,
    errors,
    selectedId,
    selectedEdgeId,
    select,
    selectEdge,
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
  };
}
