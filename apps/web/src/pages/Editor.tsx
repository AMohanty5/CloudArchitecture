import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { Inspector } from '../canvas/Inspector';
import { EdgeInspector } from '../canvas/EdgeInspector';
import { useEditor } from '../lib/useEditor';
import type { SaveState } from '../lib/useEditor';
import { useConnectionRules } from '../lib/queries';
import { evaluateConnection, makeConnectionId } from '../canvas/connections';
import type { ConnectVerdict } from '../canvas/Canvas';
import type { CamlComponent, ProjectableModel } from '../canvas/projector';

const SAVE_BADGE: Record<SaveState, { label: string; color: string }> = {
  loading: { label: 'Loading…', color: '#94a3b8' },
  saving: { label: '● Saving…', color: '#d97706' },
  saved: { label: '● Saved', color: '#16a34a' },
  conflict: { label: '● Conflict — reloaded from server', color: '#ea580c' },
  error: { label: '● Save failed — reverted', color: '#dc2626' },
};

export function Editor() {
  const { id = '' } = useParams();
  const editor = useEditor(id);
  const { model, layout, saveState, errors, selectedId, selectedEdgeId } = editor;
  const badge = SAVE_BADGE[saveState];

  const components: CamlComponent[] = model?.components ?? [];
  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const serviceKeys = useMemo(
    () => [...new Set(components.map((c) => c.binding?.service).filter((s): s is string => Boolean(s)))],
    [components],
  );
  const rulesByService = useConnectionRules(serviceKeys);

  // Resolve a candidate edge (source→target node ids) to a catalog verdict.
  const verdict = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return { allowed: false, kinds: [], protocols: [], reason: 'A node cannot connect to itself' };
      const from = byId.get(sourceId);
      const to = byId.get(targetId);
      if (!from || !to) return { allowed: false, kinds: [], protocols: [], reason: 'Unknown endpoint' };
      return evaluateConnection(
        { type: from.type, rules: rulesByService.get(from.binding?.service ?? '') },
        { type: to.type, rules: rulesByService.get(to.binding?.service ?? '') },
      );
    },
    [byId, rulesByService],
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

  const selectedComponent = byId.get(selectedId ?? '');
  const selectedEdge = model?.connections?.find((c) => c.id === selectedEdgeId);

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
        <span style={{ marginLeft: 'auto', fontSize: 13, color: badge.color }}>{badge.label}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette />
        <div style={{ flex: 1, minWidth: 0 }}>
          {model ? (
            <Canvas
              model={model as ProjectableModel}
              layout={{ positions: layout }}
              onDropService={editor.addComponent}
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
        ) : (
          <Inspector
            component={selectedComponent}
            errors={errors}
            onRename={(name) => selectedId && editor.rename(selectedId, name)}
            onSetProperty={(key, value) => selectedId && editor.setProperty(selectedId, key, value)}
          />
        )}
      </div>
    </div>
  );
}
