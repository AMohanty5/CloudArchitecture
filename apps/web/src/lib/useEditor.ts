import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from './client';
import { applyCommand, componentFromService, makeComponentId } from '../canvas/commands';
import type { Command, EditableModel, ServiceLike } from '../canvas/commands';

export type SaveState = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';

export interface EditorApi {
  model: EditableModel | undefined;
  layout: Record<string, { x: number; y: number }>;
  saveState: SaveState;
  addComponent: (service: ServiceLike, position: { x: number; y: number }) => void;
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
        setSaveState('error');
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

  const addComponent = useCallback(
    (service: ServiceLike, position: { x: number; y: number }) => {
      const componentId = makeComponentId(service.key);
      const component = componentFromService(service, componentId);
      if (!component) return; // group-kind services land in Day 16
      const nextLayout = { ...layoutRef.current, [componentId]: position };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      execute({ type: 'AddComponent', component });
    },
    [execute],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { model, layout, saveState, addComponent };
}
