import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { Inspector } from '../canvas/Inspector';
import { GroupInspector } from '../canvas/GroupInspector';
import { EdgeInspector } from '../canvas/EdgeInspector';
import { HistoryPanel } from '../canvas/HistoryPanel';
import { DiffPanel } from '../canvas/DiffPanel';
import { ValidationPanel } from '../canvas/ValidationPanel';
import { useEditor } from '../lib/useEditor';
import type { SaveState } from '../lib/useEditor';
import { useAllConnectionRules, useCommits, useDiff, useCommitModel, fetchCommitModel, useValidation } from '../lib/queries';
import { evaluateConnection, groupEndpointType, makeConnectionId } from '../canvas/connections';
import type { Endpoint } from '../canvas/connections';
import { groupRelationships } from '../canvas/relationships';
import { applyView, VIEW_LABEL } from '../canvas/views';
import type { ArchView } from '../canvas/views';
import { LAYOUT_PRESETS, DEFAULT_STRATEGY } from '../canvas/layout';
import type { LayoutStrategy } from '../canvas/layout';
import type { CanvasTheme } from '../canvas/theme';
import { containmentViolations, violatingGroupIds } from '../canvas/containment';
import { buildFragment, parseFragment, CAML_FRAGMENT_MIME } from '../canvas/clipboard';
import { buildDiffView } from '../canvas/diffView';
import { findingSeverityByTarget } from '../canvas/validationView';
import { downloadDataUrl, downloadBlob, safeFilename } from '../lib/download';
import type { ConnectVerdict, CanvasExporter } from '../canvas/Canvas';
import type { CamlComponent, CamlGroup, ProjectableModel } from '../canvas/projector';
import type { ServiceLike, EditableModel } from '../canvas/commands';

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

const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '5px 7px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 13,
};
const exportActionStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 10,
  marginBottom: 8,
  padding: '6px 8px',
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
};

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
  error: { label: '● Invalid — fix to save', color: '#dc2626' },
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

  // ---- Layout preset (Day 40): persisted per-architecture in localStorage ----
  const [layoutStrategy, setLayoutStrategy] = useState<LayoutStrategy>(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(`cac:layout:${id}`);
      } catch {
        return null;
      }
    })();
    return stored && stored in LAYOUT_PRESETS ? (stored as LayoutStrategy) : DEFAULT_STRATEGY;
  });
  const [showLabels, setShowLabels] = useState(false);
  // Canvas backdrop theme (light/dark) — a global preference (docs/visual-redesign.md §11).
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>(() => {
    try {
      return localStorage.getItem('cac:canvas-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const toggleCanvasTheme = useCallback(() => {
    setCanvasTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('cac:canvas-theme', next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  // Composed view (Day 70, beta): containers render as backdrops behind flat nodes.
  const [compose, setCompose] = useState(() => {
    try {
      return localStorage.getItem('cac:compose') === '1';
    } catch {
      return false;
    }
  });
  const toggleCompose = useCallback(() => {
    setCompose((v) => {
      const next = !v;
      try {
        localStorage.setItem('cac:compose', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  // Architecture view (Day 77): Resource (editable) vs read-only abstractions.
  const [view, setView] = useState<ArchView>('resource');
  // Architecture-layers view (Day 76): category bands instead of infra nesting.
  const [layersView, setLayersView] = useState(() => {
    try {
      return localStorage.getItem('cac:layers') === '1';
    } catch {
      return false;
    }
  });
  const toggleLayers = useCallback(() => {
    setLayersView((v) => {
      const next = !v;
      try {
        localStorage.setItem('cac:layers', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const applyLayout = useCallback(
    (s: LayoutStrategy) => {
      setLayoutStrategy(s);
      try {
        localStorage.setItem(`cac:layout:${id}`, s);
      } catch {
        /* ignore quota/availability */
      }
      void editor.tidyUp(s);
    },
    [id, editor],
  );

  // ---- History & diff (Day 19) ----
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compare, setCompare] = useState<string[]>([]); // up to two selected commit hashes
  // Gated on the panel being open: each open fetches the latest commits (incl. edits
  // made since editor load), and a manual refetch covers re-opening without remount.
  const commits = useCommits(id, historyOpen);
  const refetchCommits = commits.refetch;
  useEffect(() => {
    if (historyOpen) void refetchCommits();
  }, [historyOpen, refetchCommits]);
  const indexOf = useCallback((hash: string) => (commits.data ?? []).findIndex((c) => c.hash === hash), [commits.data]);
  // Commits are newest-first: the lower index is newer (→ `to`), the higher is older (→ `from`).
  const [fromHash, toHash] = useMemo(() => {
    if (compare.length !== 2) return [undefined, undefined] as const;
    const [a, b] = [...compare].sort((x, y) => indexOf(y) - indexOf(x));
    return [a, b] as const;
  }, [compare, indexOf]);
  const diffActive = Boolean(fromHash && toHash);
  const diffQuery = useDiff(id, fromHash, toHash);
  const toModelQuery = useCommitModel(id, toHash);
  const diffView = useMemo(
    () => (diffQuery.data && toModelQuery.data ? buildDiffView(toModelQuery.data, diffQuery.data.diff) : undefined),
    [diffQuery.data, toModelQuery.data],
  );

  const toggleCompare = useCallback((hash: string) => {
    setCompare((prev) => (prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash].slice(-2)));
  }, []);
  const onRestore = useCallback(
    (hash: string) => {
      void fetchCommitModel(id, hash).then((m) => editor.restore(m as EditableModel));
    },
    [id, editor],
  );

  // ---- Validation (Day 25): advisory rule-pack findings ----
  const [validationOpen, setValidationOpen] = useState(false);
  const validation = useValidation(id, 'main', validationOpen);
  const refetchValidation = validation.refetch;
  useEffect(() => {
    if (validationOpen) void refetchValidation();
  }, [validationOpen, refetchValidation]);
  const findingCount = validation.data?.summary.total ?? 0;
  const hasSevere = (validation.data?.summary.bySeverity.critical ?? 0) + (validation.data?.summary.bySeverity.high ?? 0) > 0;
  // Highlight flagged nodes on the canvas only while the validation panel is open.
  const findingSeverityById = useMemo(
    () => (validationOpen && validation.data ? findingSeverityByTarget(validation.data.findings) : undefined),
    [validationOpen, validation.data],
  );

  // One-click fix: apply the finding's domain patch through the CommandBus, then
  // re-run the rule pack once the autosave commit lands (validation reads head).
  const pendingRevalidate = useRef(false);
  const onFixFinding = useCallback(
    (finding: { targetId: string; fix?: { kind: 'setProperty'; key: string; value: unknown } }) => {
      if (finding.fix?.kind !== 'setProperty') return;
      editor.setProperty(finding.targetId, finding.fix.key, finding.fix.value);
      pendingRevalidate.current = true;
    },
    [editor],
  );
  useEffect(() => {
    if (saveState === 'saved' && pendingRevalidate.current) {
      pendingRevalidate.current = false;
      void refetchValidation();
    }
  }, [saveState, refetchValidation]);

  // ---- Export (Day 21): client PNG (html-to-image) + server SVG ----
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTheme, setExportTheme] = useState<'light' | 'dark'>('light');
  const [pngScale, setPngScale] = useState(2);
  const exporterRef = useRef<CanvasExporter | null>(null);
  const archName = (model as { name?: string } | undefined)?.name ?? 'architecture';

  const exportPng = useCallback(async () => {
    const dataUrl = await exporterRef.current?.toPngDataUrl({ pixelRatio: pngScale, dark: exportTheme === 'dark' });
    if (dataUrl) downloadDataUrl(dataUrl, safeFilename(archName, 'png'));
    setExportOpen(false);
  }, [pngScale, exportTheme, archName]);

  const exportSvg = useCallback(async () => {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
    const res = await fetch(`${base}/architectures/${id}/branches/main/export.svg?theme=${exportTheme}`);
    downloadBlob(await res.blob(), safeFilename(archName, 'svg'));
    setExportOpen(false);
  }, [id, exportTheme, archName]);

  const exportTerraform = useCallback(async () => {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
    const res = await fetch(`${base}/architectures/${id}/branches/main/export.tf.zip`);
    downloadBlob(await res.blob(), safeFilename(`${archName}-terraform`, 'zip'));
    setExportOpen(false);
  }, [id, archName]);

  const exportHld = useCallback(async () => {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
    const res = await fetch(`${base}/architectures/${id}/branches/main/export.hld.md`);
    downloadBlob(await res.blob(), safeFilename(`${archName}-hld`, 'md'));
    setExportOpen(false);
  }, [id, archName]);

  const exportBundle = useCallback(async () => {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
    const res = await fetch(`${base}/architectures/${id}/branches/main/export.bundle.zip?theme=${exportTheme}`);
    downloadBlob(await res.blob(), safeFilename(`${archName}-bundle`, 'zip'));
    setExportOpen(false);
  }, [id, exportTheme, archName]);

  const components: CamlComponent[] = model?.components ?? [];
  const groups: CamlGroup[] = model?.groups ?? [];
  const componentsById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind })), [groups]);

  // Prefetch every service's rules in one request so a just-dropped palette item is
  // connectable immediately (Day 52 / Blocker B — no per-service drag-time fetch race).
  const rulesByService = useAllConnectionRules();
  const violations = useMemo(() => containmentViolations(model ?? {}), [model]);
  const invalidGroupIds = useMemo(() => violatingGroupIds(model ?? {}), [model]);

  // Resolve a node id to a connection endpoint. Components carry their abstract type and
  // catalog rules; groups (e.g. a VPC) carry a synthetic `group.<kind>` type and no rules.
  const endpointFor = useCallback(
    (nodeId: string): Endpoint | undefined => {
      const c = componentsById.get(nodeId);
      if (c) return { type: c.type, rules: rulesByService.get(c.binding?.service ?? '') };
      const g = groupsById.get(nodeId);
      if (g) return { type: groupEndpointType(g.kind) };
      return undefined;
    },
    [componentsById, groupsById, rulesByService],
  );

  // Resolve a candidate edge (source→target node ids) to a catalog verdict.
  const verdict = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return { allowed: false, kinds: [], protocols: [], reason: 'A node cannot connect to itself' };
      const from = endpointFor(sourceId);
      const to = endpointFor(targetId);
      if (!from || !to) return { allowed: false, kinds: [], protocols: [], reason: 'Unknown endpoint' };
      return evaluateConnection(from, to);
    },
    [endpointFor],
  );
  const evaluate = useCallback((source: string, target: string): ConnectVerdict => verdict(source, target), [verdict]);

  const onConnect = useCallback(
    (source: string, target: string) => {
      const v = verdict(source, target);
      if (!v.allowed) return;
      // Undirected structural edges drawn "backwards" come back with flip set; store
      // them in their canonical orientation so IaC/validation see the right direction.
      const [from, to] = v.flip ? [target, source] : [source, target];
      editor.connect({ id: makeConnectionId(), from, to, kind: v.kinds[0]! });
    },
    [verdict, editor],
  );

  // Drop onto a group nests inside it. Drop a component-service onto a *component* attaches
  // it (creates the classified relationship — EBS/SG/IAM fold in); falls back to nesting in
  // that component's group when the pair can't connect. Drop on empty canvas = top level.
  const onDropService = useCallback(
    (service: ServiceLike, position: { x: number; y: number }, targetNodeId?: string) => {
      const targetComponent = targetNodeId ? componentsById.get(targetNodeId) : undefined;
      if (targetComponent && !service.groupKind) {
        const dropType = service.abstractTypes?.[0];
        const targetEnd = endpointFor(targetComponent.id);
        if (dropType && targetEnd) {
          const v = evaluateConnection({ type: dropType, rules: rulesByService.get(service.key) }, targetEnd);
          if (v.allowed) {
            editor.addComponentLinkedTo(service, position, targetComponent.group, targetComponent.id, v.kinds[0]!, v.flip ?? false);
            return;
          }
        }
        editor.addComponent(service, position, targetComponent.group); // not connectable → just nest alongside
        return;
      }
      const container = targetNodeId && groupsById.has(targetNodeId) ? targetNodeId : undefined;
      if (service.groupKind) editor.addGroup(service, position, container);
      else editor.addComponent(service, position, container);
    },
    [groupsById, componentsById, editor, endpointFor, rulesByService],
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
    if (diffActive) return; // diff mode is read-only
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
  }, [editor, selectedId, componentsById, deleteSelection, diffActive]);

  // Copy/paste as an application/x-caml+json fragment with id re-mapping on paste.
  useEffect(() => {
    if (diffActive) return; // diff mode is read-only
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
  }, [editor, model, selectedId, diffActive]);

  const selectedComponent = componentsById.get(selectedId ?? '');
  const selectedGroup = groupsById.get(selectedId ?? '');

  // The selected component's relationships, grouped for the inspector panel (Day 54).
  const relationshipItems = useMemo(() => {
    if (!selectedComponent) return undefined;
    const grouped = groupRelationships(
      selectedComponent.id,
      model?.connections ?? [],
      (id) => componentsById.get(id)?.type,
    );
    const toItems = (rows: { connId: string; otherId: string; kind: string }[]) =>
      rows.map((r) => {
        const other = componentsById.get(r.otherId);
        return { connId: r.connId, name: other?.name ?? r.otherId, service: other?.binding?.service, kind: r.kind };
      });
    return {
      attachments: toItems(grouped.attachments),
      security: toItems(grouped.security),
      identity: toItems(grouped.identity),
      sidecar: toItems(grouped.sidecar),
      communications: toItems(grouped.communications),
    };
  }, [selectedComponent, model, componentsById]);
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
        <strong>{(model as { name?: string } | undefined)?.name ?? 'Editor'}</strong>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          <button onClick={editor.undo} disabled={!editor.canUndo} title="Undo (⌘Z)" style={toolBtn(editor.canUndo)}>
            ↶
          </button>
          <button onClick={editor.redo} disabled={!editor.canRedo} title="Redo (⇧⌘Z)" style={toolBtn(editor.canRedo)}>
            ↷
          </button>
        </div>
        <button
          onClick={() => void editor.tidyUp(layoutStrategy)}
          disabled={editor.tidying || !model}
          title="Auto-layout (ELK)"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: editor.tidying ? '#cbd5e1' : '#334155',
            cursor: editor.tidying ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          {editor.tidying ? 'Tidying…' : '✨ Tidy up'}
        </button>
        <select
          value={layoutStrategy}
          onChange={(e) => applyLayout(e.target.value as LayoutStrategy)}
          disabled={editor.tidying || !model}
          title="Layout preset"
          style={{
            marginLeft: 4,
            padding: '4px 6px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: editor.tidying || !model ? '#cbd5e1' : '#334155',
            cursor: editor.tidying || !model ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          {(Object.keys(LAYOUT_PRESETS) as LayoutStrategy[]).map((s) => (
            <option key={s} value={s}>
              {LAYOUT_PRESETS[s].label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowLabels((v) => !v)}
          title="Toggle connection labels (protocol/port)"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: showLabels ? '#eff6ff' : '#fff',
            color: showLabels ? '#2563eb' : '#334155',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          🏷 Labels
        </button>
        <button
          onClick={toggleCanvasTheme}
          title="Toggle dark / light canvas"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: canvasTheme === 'dark' ? '#0f172a' : '#fff',
            color: canvasTheme === 'dark' ? '#e2e8f0' : '#334155',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {canvasTheme === 'dark' ? '🌙 Dark' : '☀ Light'}
        </button>
        <button
          onClick={toggleCompose}
          title="Composed view (beta): containers as backdrops, flat nodes"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: compose ? '#eff6ff' : '#fff',
            color: compose ? '#2563eb' : '#334155',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ▢ Compose
        </button>
        <button
          onClick={toggleLayers}
          title="Architecture layers view: EDGE / NETWORK / COMPUTE / DATA / SECURITY / OBS bands"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: layersView ? '#eff6ff' : '#fff',
            color: layersView ? '#2563eb' : '#334155',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ▦ Layers
        </button>
        <select
          value={view}
          onChange={(e) => setView(e.target.value as ArchView)}
          title="Architecture view (non-Resource views are read-only)"
          style={{ marginLeft: 4, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: view === 'resource' ? '#fff' : '#eff6ff', color: view === 'resource' ? '#334155' : '#2563eb', cursor: 'pointer', fontSize: 13 }}
        >
          {(Object.keys(VIEW_LABEL) as ArchView[]).map((v) => (
            <option key={v} value={v}>
              👁 {VIEW_LABEL[v]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          title="History & diff"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: historyOpen ? '#eff6ff' : '#fff',
            color: historyOpen ? '#2563eb' : '#334155',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          🕑 History
        </button>
        <button
          onClick={() => setValidationOpen((v) => !v)}
          disabled={diffActive || !model}
          title="Validate (rule pack)"
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: validationOpen ? '#eff6ff' : '#fff',
            color: diffActive || !model ? '#cbd5e1' : validationOpen ? '#2563eb' : '#334155',
            cursor: diffActive || !model ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          ✓ Validate
          {findingCount > 0 ? (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: '#fff',
                background: hasSevere ? '#dc2626' : '#d97706',
                borderRadius: 10,
                padding: '0 6px',
              }}
            >
              {findingCount}
            </span>
          ) : null}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={diffActive || !model}
            title="Export PNG / SVG / Terraform / HLD"
            style={{
              marginLeft: 4,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: exportOpen ? '#eff6ff' : '#fff',
              color: diffActive || !model ? '#cbd5e1' : exportOpen ? '#2563eb' : '#334155',
              cursor: diffActive || !model ? 'default' : 'pointer',
              fontSize: 13,
            }}
          >
            ⬇ Export
          </button>
          {exportOpen ? (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                left: 0,
                zIndex: 10,
                width: 200,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
                padding: 12,
                fontSize: 13,
              }}
            >
              <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Theme</label>
              <select value={exportTheme} onChange={(e) => setExportTheme(e.target.value as 'light' | 'dark')} style={selectStyle}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', margin: '10px 0 4px' }}>PNG scale</label>
              <select value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))} style={selectStyle}>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={3}>3×</option>
              </select>
              <button onClick={() => void exportPng()} style={exportActionStyle}>
                Download PNG
              </button>
              <button onClick={() => void exportSvg()} style={exportActionStyle}>
                Download SVG
              </button>
              <button onClick={() => void exportTerraform()} style={exportActionStyle}>
                Download Terraform
              </button>
              <button onClick={() => void exportHld()} style={exportActionStyle}>
                Download HLD (.md)
              </button>
              <button
                onClick={() => void exportBundle()}
                style={{ ...exportActionStyle, marginBottom: 0, background: '#1e293b' }}
              >
                Download all (.zip)
              </button>
            </div>
          ) : null}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: badge.color }}>{badge.label}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {historyOpen ? (
          <HistoryPanel
            commits={commits.data ?? []}
            loading={commits.isLoading}
            selected={compare}
            onToggleSelect={toggleCompare}
            onRestore={onRestore}
          />
        ) : (
          <Palette />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {diffActive && diffView ? (
            <Canvas model={diffView.model} layout={{}} diffStatus={diffView.status} title={archName} subtitle="Comparing commits" canvasTheme={canvasTheme} />
          ) : model ? (
            <Canvas
              model={view === 'resource' ? (model as ProjectableModel) : applyView(model as ProjectableModel, view)}
              layout={view === 'resource' ? layout : {}}
              title={view === 'resource' ? archName : `${archName} · ${VIEW_LABEL[view]} view`}
              onDropService={view === 'resource' ? onDropService : undefined}
              invalidGroupIds={invalidGroupIds}
              selectedId={selectedId}
              onSelect={editor.select}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={editor.selectEdge}
              evaluate={view === 'resource' ? evaluate : undefined}
              onConnect={view === 'resource' ? onConnect : undefined}
              onNodeMove={view === 'resource' ? editor.moveNode : undefined}
              showEdgeLabels={showLabels}
              canvasTheme={canvasTheme}
              compose={compose}
              layers={layersView}
              findingSeverityById={findingSeverityById}
              registerExporter={(api) => (exporterRef.current = api)}
            />
          ) : null}
        </div>
        {diffActive ? (
          diffQuery.data ? (
            <DiffPanel diff={diffQuery.data} loading={diffQuery.isLoading || toModelQuery.isLoading} onExit={() => setCompare([])} />
          ) : (
            <aside style={{ width: 300, flexShrink: 0, borderLeft: '1px solid #e2e8f0', padding: 14, fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#94a3b8' }}>
              Loading diff…
            </aside>
          )
        ) : validationOpen ? (
          <ValidationPanel
            report={validation.data}
            loading={validation.isFetching}
            selectedId={selectedId}
            onSelectTarget={(targetId) => editor.select(targetId)}
            onFix={onFixFinding}
            onRefresh={() => void refetchValidation()}
          />
        ) : selectedEdge ? (
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
            relationships={relationshipItems}
            onRename={(name) => selectedId && editor.rename(selectedId, name)}
            onSetProperty={(key, value) => selectedId && editor.setProperty(selectedId, key, value)}
            onMoveToGroup={(group) => selectedId && editor.moveToGroup(selectedId, group)}
            onDetach={(connId) => editor.disconnect(connId)}
          />
        )}
      </div>
    </div>
  );
}
