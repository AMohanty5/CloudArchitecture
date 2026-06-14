import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { Inspector } from '../canvas/Inspector';
import { GroupInspector } from '../canvas/GroupInspector';
import { EdgeInspector } from '../canvas/EdgeInspector';
import { useEditor } from '../lib/useEditor';
import type { SaveState } from '../lib/useEditor';
import { useConnectionRules } from '../lib/queries';
import { evaluateConnection, makeConnectionId } from '../canvas/connections';
import { containmentViolations, violatingGroupIds } from '../canvas/containment';
import { buildFragment, parseFragment, CAML_FRAGMENT_MIME } from '../canvas/clipboard';
import type { ConnectVerdict } from '../canvas/Canvas';
import type { CamlComponent, CamlGroup, ProjectableModel } from '../canvas/projector';
import type { ServiceLike } from '../canvas/commands';

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function inFormField(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function toolBtn(enabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: enabled ? '#334155' : '#cbd5e1',
    cursor: enabled ? 'pointer' : 'default',
    fontSize: 14,
    lineHeight: 1,
  };
}

const SAVE_BADGE: Record<SaveState, { label: string; color: string }> = {
  loading: { label: 'Loading…', color: '#94a3b8' },
  saving: { label: '● Saving…', color: '#d97706' },
  saved: { label: '● Saved', color: '#16a34a' },
  conflict: { label: '● Conflict — reloaded from server', color: '#ea580c' },
  error: { label: '● Save failed — reverted', color: '#dc2626' },
};

/** Group ids reachable from `rootId` (its descendants) — invalid re-parent targets. */
function descendantGroupIds(groups: CamlGroup[], rootId: string): Set<string> {
  const childrenOf = new Map<string, CamlGroup[]>();
  for (const g of groups) {
    if (!g.parent) continue;
    const siblings = childrenOf.get(g.parent) ?? [];
    siblings.push(g);
    childrenOf.set(g.parent, siblings);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    for (const child of childrenOf.get(stack.pop()!) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

export function Editor() {
  const { id = '' } = useParams();
  const editor = useEditor(id);
  const { model, layout, saveState, errors, selectedId, selectedEdgeId } = editor;
  const badge = SAVE_BADGE[saveState];

  const components: CamlComponent[] = model?.components ?? [];
  const groups: CamlGroup[] = model?.groups ?? [];
  const componentsById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind })), [groups]);

  const serviceKeys = useMemo(
    () => [...new Set(components.map((c) => c.binding?.service).filter((s): s is string => Boolean(s)))],
    [components],
  );
  const rulesByService = useConnectionRules(serviceKeys);
  const violations = useMemo(() => containmentViolations(model ?? {}), [model]);
  const invalidGroupIds = useMemo(() => violatingGroupIds(model ?? {}), [model]);

  // Resolve a candidate edge (source→target node ids) to a catalog verdict.
  const verdict = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return { allowed: false, kinds: [], protocols: [], reason: 'A node cannot connect to itself' };
      const from = componentsById.get(sourceId);
      const to = componentsById.get(targetId);
      if (!from || !to) return { allowed: false, kinds: [], protocols: [], reason: 'Unknown endpoint' };
      return evaluateConnection(
        { type: from.type, rules: rulesByService.get(from.binding?.service ?? '') },
        { type: to.type, rules: rulesByService.get(to.binding?.service ?? '') },
      );
    },
    [componentsById, rulesByService],
  );
  const evaluate = useCallback((source: string, target: string): ConnectVerdict => verdict(source, target), [verdict]);

  const onConnect = useCallback(
    (source: string, target: string) => {
      const v = verdict(source, target);
      if (!v.allowed) return;
      editor.connect({ id: makeConnectionId(), from: source, to: target, kind: v.kinds[0]! });
    },
    [verdict, editor],
  );

  // Drop onto a group nests inside it; drop onto a component nests in that component's group.
  const onDropService = useCallback(
    (service: ServiceLike, position: { x: number; y: number }, targetNodeId?: string) => {
      const container = targetNodeId
        ? groupsById.has(targetNodeId)
          ? targetNodeId
          : componentsById.get(targetNodeId)?.group
        : undefined;
      if (service.groupKind) editor.addGroup(service, position, container);
      else editor.addComponent(service, position, container);
    },
    [groupsById, componentsById, editor],
  );

  const deleteSelection = useCallback(() => {
    if (selectedEdgeId) {
      editor.disconnect(selectedEdgeId);
      editor.selectEdge(undefined);
    } else if (selectedId) {
      if (groupsById.has(selectedId)) editor.removeGroup(selectedId);
      else editor.removeComponent(selectedId);
      editor.select(undefined);
    }
  }, [editor, selectedId, selectedEdgeId, groupsById]);

  // Keyboard map (blueprint doc 06): undo/redo, delete, duplicate, nudge, escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inFormField(e.target)) return; // let inspector fields keep native editing/undo
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        editor.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        if (selectedId && componentsById.has(selectedId)) editor.duplicate(selectedId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        editor.select(undefined);
        editor.selectEdge(undefined);
      } else if (selectedId && ARROW_DELTA[e.key]) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 8;
        const [dx, dy] = ARROW_DELTA[e.key]!;
        editor.nudge(selectedId, dx * step, dy * step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, selectedId, componentsById, deleteSelection]);

  // Copy/paste as an application/x-caml+json fragment with id re-mapping on paste.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (inFormField(document.activeElement) || !model || !selectedId) return;
      const fragment = buildFragment(model, selectedId);
      if (!fragment) return;
      const json = JSON.stringify(fragment);
      e.clipboardData?.setData(CAML_FRAGMENT_MIME, json);
      e.clipboardData?.setData('text/plain', json);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inFormField(document.activeElement)) return;
      const raw = e.clipboardData?.getData(CAML_FRAGMENT_MIME) || e.clipboardData?.getData('text/plain') || '';
      const fragment = parseFragment(raw);
      if (!fragment) return;
      e.preventDefault();
      editor.paste(fragment);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [editor, model, selectedId]);

  const selectedComponent = componentsById.get(selectedId ?? '');
  const selectedGroup = groupsById.get(selectedId ?? '');
  const selectedEdge = model?.connections?.find((c) => c.id === selectedEdgeId);

  const groupParentOptions = useMemo(() => {
    if (!selectedGroup) return [];
    const forbidden = descendantGroupIds(groups, selectedGroup.id);
    return groups.filter((g) => g.id !== selectedGroup.id && !forbidden.has(g.id)).map((g) => ({ id: g.id, name: g.name, kind: g.kind }));
  }, [groups, selectedGroup]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e2e8f0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Architectures
        </Link>
        <strong>Editor</strong>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          <button onClick={editor.undo} disabled={!editor.canUndo} title="Undo (⌘Z)" style={toolBtn(editor.canUndo)}>
            ↶
          </button>
          <button onClick={editor.redo} disabled={!editor.canRedo} title="Redo (⇧⌘Z)" style={toolBtn(editor.canRedo)}>
            ↷
          </button>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: badge.color }}>{badge.label}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette />
        <div style={{ flex: 1, minWidth: 0 }}>
          {model ? (
            <Canvas
              model={model as ProjectableModel}
              layout={{ positions: layout }}
              onDropService={onDropService}
              invalidGroupIds={invalidGroupIds}
              selectedId={selectedId}
              onSelect={editor.select}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={editor.selectEdge}
              evaluate={evaluate}
              onConnect={onConnect}
            />
          ) : null}
        </div>
        {selectedEdge ? (
          <EdgeInspector
            connection={selectedEdge}
            kindOptions={verdict(selectedEdge.from, selectedEdge.to).kinds}
            onSetKind={(kind) => editor.setConnectionKind(selectedEdge.id, kind)}
            onSetProperty={(key, value) => editor.setConnectionProperty(selectedEdge.id, key, value)}
            onDisconnect={() => {
              editor.disconnect(selectedEdge.id);
              editor.selectEdge(undefined);
            }}
          />
        ) : selectedGroup ? (
          <GroupInspector
            group={selectedGroup}
            parentOptions={groupParentOptions}
            violation={violations.find((v) => v.groupId === selectedGroup.id)?.message}
            errors={errors}
            onRename={(name) => editor.renameGroup(selectedGroup.id, name)}
            onReparent={(parent) => editor.moveGroup(selectedGroup.id, parent)}
            onSetProperty={(key, value) => editor.setGroupProperty(selectedGroup.id, key, value)}
          />
        ) : (
          <Inspector
            component={selectedComponent}
            errors={errors}
            groups={groupOptions}
            onRename={(name) => selectedId && editor.rename(selectedId, name)}
            onSetProperty={(key, value) => selectedId && editor.setProperty(selectedId, key, value)}
            onMoveToGroup={(group) => selectedId && editor.moveToGroup(selectedId, group)}
          />
        )}
      </div>
    </div>
  );
}
