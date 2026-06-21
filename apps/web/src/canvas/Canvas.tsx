import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { project } from './projector';
import type { LayoutSidecar, ProjectableModel } from './projector';
import { ServiceNode } from './ServiceNode';
import { GroupNode } from './GroupNode';
import { EntryNode } from './EntryNode';
import { SERVICE_DRAG_MIME } from './commands';
import type { ServiceLike } from './commands';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { CANVAS_THEME, CATEGORY_LEGEND, CONNECTOR_KINDS, FONT, NEUTRAL, RADIUS, SHADOW } from './theme';
import type { CanvasTheme } from './theme';
import type { Severity } from '../lib/queries';

const nodeTypes: NodeTypes = { service: ServiceNode, group: GroupNode, entry: EntryNode };

/** Snap-to-grid step (flow units) and alignment-guide tolerance (screen px). */
const GRID = 16;
const GUIDE_PX = 6;

/** Verdict for a candidate edge, resolved by the editor from catalog rules. */
export interface ConnectVerdict {
  allowed: boolean;
  reason?: string;
}

/** Imperative export handle the canvas registers with its parent (Day 21). */
export interface CanvasExporter {
  toPngDataUrl: (opts: { pixelRatio: number; dark: boolean }) => Promise<string | null>;
}

interface CanvasProps {
  model: ProjectableModel;
  layout?: LayoutSidecar;
  /** When provided, the canvas accepts palette drops and emits the dropped service, flow position, and the node dropped onto (if any). */
  onDropService?: (service: ServiceLike, position: { x: number; y: number }, targetNodeId?: string) => void;
  /** Group ids with a containment violation (rendered with a warning badge). */
  invalidGroupIds?: Set<string>;
  /** Currently-selected node id; when `onSelect` is provided the canvas is selectable. */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  /** Currently-selected edge id. */
  selectedEdgeId?: string;
  onSelectEdge?: (id: string | undefined) => void;
  /** Catalog verdict for a candidate edge; when provided, the canvas allows drawing connections. */
  evaluate?: (source: string, target: string) => ConnectVerdict;
  onConnect?: (source: string, target: string) => void;
  /** Diff overlay: element/connection id → change status (added/removed/modified). */
  diffStatus?: Record<string, DiffStatus>;
  /** Validation overlay: element id → worst finding severity (Day 26). */
  findingSeverityById?: Record<string, Severity>;
  /** Receives an export handle once the flow is mounted (PNG of the whole diagram). */
  registerExporter?: (exporter: CanvasExporter) => void;
  /** Optional presentation title block pinned to the top-left of the canvas. */
  title?: string;
  subtitle?: string;
  /** When provided, nodes are draggable; receives the final parent-relative position on drag end. */
  onNodeMove?: (id: string, position: { x: number; y: number }) => void;
  /** Show protocol/port labels on connections (toggled from the editor toolbar). */
  showEdgeLabels?: boolean;
  /** Canvas backdrop theme (pane background + grid). Defaults to light. */
  canvasTheme?: CanvasTheme;
}

const sectionLabel: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: `var(--cac-muted, ${NEUTRAL.muted})` };

/** A presentation title block pinned to the top-left of the canvas. */
function TitleBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '8px 14px',
        background: `var(--cac-surface, rgba(255,255,255,0.92))`,
        border: `1px solid var(--cac-hairline, ${NEUTRAL.border})`,
        borderRadius: RADIUS.group,
        boxShadow: SHADOW.overlay,
        fontFamily: FONT,
        pointerEvents: 'none',
        zIndex: 4,
        maxWidth: 360,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: `var(--cac-text, ${NEUTRAL.text})`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 11.5, color: `var(--cac-muted, ${NEUTRAL.subtle})`, marginTop: 1 }}>{subtitle}</div> : null}
    </div>
  );
}

/** A collapsible legend (connector kinds + service categories) pinned to the canvas corner. */
function CanvasLegend({ kinds }: { kinds: Set<string> }) {
  const [open, setOpen] = useState(true);
  const connectors = CONNECTOR_KINDS.filter((c) => kinds.has(c.kind));
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        padding: open ? '9px 11px' : '6px 10px',
        background: `var(--cac-surface, rgba(255,255,255,0.94))`,
        border: `1px solid var(--cac-hairline, ${NEUTRAL.border})`,
        borderRadius: 9,
        boxShadow: SHADOW.overlay,
        fontFamily: FONT,
        fontSize: 11,
        color: `var(--cac-muted, ${NEUTRAL.subtle})`,
        zIndex: 4,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, ...sectionLabel }}
      >
        {open ? '▾' : '▸'} Legend
      </button>
      {open ? (
        <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
          {connectors.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={sectionLabel}>Connections</div>
              {connectors.map((l) => (
                <div key={l.kind} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="26" height="8" aria-hidden>
                    <line x1="1" y1="4" x2="25" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                  </svg>
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={sectionLabel}>Categories</div>
            {CATEGORY_LEGEND.map((c) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Inner flow — lives inside ReactFlowProvider so it can use the instance for screen→flow coords. */
function Flow({
  model,
  layout,
  onDropService,
  invalidGroupIds,
  selectedId,
  onSelect,
  selectedEdgeId,
  onSelectEdge,
  evaluate,
  onConnect,
  diffStatus,
  findingSeverityById,
  registerExporter,
  title,
  subtitle,
  onNodeMove,
  showEdgeLabels,
  canvasTheme = 'light',
}: CanvasProps) {
  const backdrop = CANVAS_THEME[canvasTheme];
  // Theme surfaces via CSS custom properties on the wrapper — they cascade to every custom
  // node/container so dark mode reaches all surfaces without threading the theme through the
  // pure projector (Day 60). Nodes/containers read var(--cac-*) with a light fallback.
  const themeVars = {
    '--cac-surface': backdrop.nodeSurface,
    '--cac-text': backdrop.text,
    '--cac-muted': backdrop.muted,
    '--cac-hairline': backdrop.hairline,
    '--cac-ring': backdrop.selectedRing,
  } as React.CSSProperties;
  const { nodes, edges } = useMemo(() => project(model, layout), [model, layout]);
  const selectedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        data: {
          ...n.data,
          ...(n.type === 'group' ? { invalid: invalidGroupIds?.has(n.id) ?? false } : {}),
          diffStatus: diffStatus?.[n.id],
          findingSeverity: findingSeverityById?.[n.id],
        },
      })),
    [nodes, selectedId, invalidGroupIds, diffStatus, findingSeverityById],
  );
  const styledEdges = useMemo(
    () => {
      const conn = backdrop.connector;
      // Desaturate to the theme's connector palette: only the request path (traffic) and
      // data flows keep an accent; everything else is neutral, distinguished by dash. Edges
      // never dominate, and they adapt to dark mode (visual-redesign §4).
      const connectorColor = (kind: string): string =>
        kind === 'traffic' ? conn.traffic : kind === 'data' ? conn.data : conn.neutral;
      return edges.map((e) => {
        const ds = diffStatus?.[e.id];
        const stroke = ds ? DIFF_COLOR[ds] : connectorColor(e.data.kind);
        const active = e.id === selectedEdgeId || Boolean(ds);
        const marker = { type: MarkerType.ArrowClosed, color: stroke, width: 11, height: 11 };
        return {
          ...e,
          // Clean reference look: orthogonal routing + small arrowheads; labels are opt-in.
          type: 'smoothstep',
          label: showEdgeLabels ? e.label : undefined,
          labelStyle: { fontSize: 10, fill: backdrop.muted, fontFamily: FONT },
          labelBgStyle: { fill: backdrop.nodeSurface, fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: marker,
          markerStart: e.bidirectional ? marker : undefined,
          selected: e.id === selectedEdgeId,
          style: {
            ...e.style,
            stroke,
            ...(ds ? { strokeDasharray: ds === 'removed' ? '4 4' : undefined } : {}),
            strokeWidth: active ? 2.5 : 1.5,
          },
        };
      });
    },
    [edges, selectedEdgeId, diffStatus, showEdgeLabels, backdrop],
  );
  // Connector kinds present in the model → drives the legend's Connections section.
  const presentKinds = useMemo(() => new Set(edges.map((e) => e.data.kind)), [edges]);
  const { screenToFlowPosition, getNodes, getInternalNode, getViewport } = useReactFlow();
  const editable = Boolean(onDropService);
  const selectable = Boolean(onSelect || onSelectEdge);
  const connectable = Boolean(onConnect);
  const draggable = Boolean(onNodeMove);

  // Alignment guides (Day 39): screen-space helper lines shown while dragging a node
  // when one of its edges/centre lines up with another node's, within GUIDE_PX.
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const dragged = getInternalNode(node.id);
      if (!dragged) return;
      const vp = getViewport();
      const a = dragged.internals.positionAbsolute;
      const aw = dragged.measured?.width ?? 0;
      const ah = dragged.measured?.height ?? 0;
      const ax = [a.x, a.x + aw / 2, a.x + aw];
      const ay = [a.y, a.y + ah / 2, a.y + ah];
      const threshold = GUIDE_PX / vp.zoom;
      let gx: number | undefined;
      let gy: number | undefined;
      for (const other of getNodes()) {
        if (other.id === node.id) continue;
        const o = getInternalNode(other.id);
        if (!o) continue;
        const ow = o.measured?.width ?? 0;
        const oh = o.measured?.height ?? 0;
        const ox = [o.internals.positionAbsolute.x, o.internals.positionAbsolute.x + ow / 2, o.internals.positionAbsolute.x + ow];
        const oy = [o.internals.positionAbsolute.y, o.internals.positionAbsolute.y + oh / 2, o.internals.positionAbsolute.y + oh];
        if (gx === undefined) for (const e of ax) for (const t of ox) if (Math.abs(e - t) <= threshold) gx = t;
        if (gy === undefined) for (const e of ay) for (const t of oy) if (Math.abs(e - t) <= threshold) gy = t;
      }
      // Flow → screen (the overlay shares the pane's box, so this is the pane offset).
      setGuides({
        x: gx === undefined ? undefined : gx * vp.zoom + vp.x,
        y: gy === undefined ? undefined : gy * vp.zoom + vp.y,
      });
    },
    [getInternalNode, getViewport, getNodes],
  );
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      setGuides({});
      onNodeMove?.(node.id, node.position);
    },
    [onNodeMove],
  );

  // Register a whole-diagram PNG exporter: fit all nodes into a fixed canvas, then
  // rasterise the React Flow viewport at the requested pixel ratio (doc 06 export).
  useEffect(() => {
    if (!registerExporter) return;
    registerExporter({
      toPngDataUrl: async ({ pixelRatio, dark }) => {
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
        const all = getNodes();
        if (!viewport || all.length === 0) return null;
        const bounds = getNodesBounds(all);
        const padding = 48;
        const width = Math.ceil(bounds.width) + padding * 2;
        const height = Math.ceil(bounds.height) + padding * 2;
        const vp = getViewportForBounds(bounds, width, height, 0.2, 2, padding);
        return toPng(viewport, {
          backgroundColor: dark ? '#0f172a' : '#ffffff',
          width,
          height,
          pixelRatio,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
          },
        });
      },
    });
  }, [registerExporter, getNodes]);

  const [hint, setHint] = useState<string | null>(null);
  const hintRef = useRef<string | null>(null);
  const showHint = (reason: string | null) => {
    if (hintRef.current === reason) return; // guard redundant setState during drag hover
    hintRef.current = reason;
    setHint(reason);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(SERVICE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onDropService) return;
      const raw = e.dataTransfer.getData(SERVICE_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      let service: ServiceLike;
      try {
        service = JSON.parse(raw) as ServiceLike;
      } catch {
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // The node dropped onto (component or group), if any — used to nest into containers.
      const targetNodeId = (e.target as HTMLElement).closest('.react-flow__node')?.getAttribute('data-id') ?? undefined;
      onDropService(service, position, targetNodeId);
    },
    [onDropService, screenToFlowPosition],
  );

  // Drag-time validation: blocks invalid drops and surfaces the catalog reason as a hint.
  const isValidConnection = useCallback(
    (c: Connection | Edge): boolean => {
      if (!evaluate || !c.source || !c.target) return false;
      const v = evaluate(c.source, c.target);
      showHint(v.allowed ? null : (v.reason ?? 'Invalid connection'));
      return v.allowed;
    },
    [evaluate],
  );

  const handleConnect = useCallback(
    (c: Connection) => {
      showHint(null);
      if (onConnect && c.source && c.target) onConnect(c.source, c.target);
    },
    [onConnect],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...themeVars }} onDragOver={editable ? onDragOver : undefined} onDrop={editable ? onDrop : undefined}>
      {/* Animate position changes (e.g. ELK "Tidy up") with a short transform transition. */}
      <style>{'.react-flow__node { transition: transform 0.28s ease; } .react-flow__edge:hover .react-flow__edge-path { stroke-width: 3px; }'}</style>
      <ReactFlow
        nodes={selectedNodes as unknown as Node[]}
        edges={styledEdges as unknown as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        // Fill + centre with a consistent margin; cap zoom so a small diagram doesn't
        // balloon to fill the pane (fixes the cramped, right-shifted initial framing).
        fitViewOptions={{ padding: 0.18, maxZoom: 1.4, minZoom: 0.15 }}
        nodesDraggable={draggable}
        snapToGrid={draggable}
        snapGrid={[GRID, GRID]}
        onNodeDrag={draggable ? onNodeDrag : undefined}
        onNodeDragStop={draggable ? onNodeDragStop : undefined}
        nodesConnectable={connectable}
        elementsSelectable={selectable}
        onNodeClick={onSelect ? (_, node) => onSelect(node.id) : undefined}
        onEdgeClick={onSelectEdge ? (_, edge) => onSelectEdge(edge.id) : undefined}
        onPaneClick={
          onSelect || onSelectEdge
            ? () => {
                onSelect?.(undefined);
                onSelectEdge?.(undefined);
                showHint(null);
              }
            : undefined
        }
        connectionMode={ConnectionMode.Loose}
        isValidConnection={connectable ? isValidConnection : undefined}
        onConnect={connectable ? handleConnect : undefined}
        onConnectStart={() => showHint(null)}
        deleteKeyCode={null}
        panActivationKeyCode="Space"
        onlyRenderVisibleElements
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        style={{ background: backdrop.paneBg }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color={backdrop.gridDot} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {guides.x !== undefined ? (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: guides.x, width: 1, background: '#2563eb', pointerEvents: 'none', zIndex: 5 }} />
      ) : null}
      {guides.y !== undefined ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: guides.y, height: 1, background: '#2563eb', pointerEvents: 'none', zIndex: 5 }} />
      ) : null}
      {title ? <TitleBlock title={title} subtitle={subtitle} /> : null}
      {styledEdges.length > 0 ? <CanvasLegend kinds={presentKinds} /> : null}
      {hint ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
            pointerEvents: 'none',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Canvas: renders a CAML model via the projector (Day 12, read-only). When
 * `onDropService` is supplied it also accepts palette drops (Day 13); selection +
 * `onConnect`/`evaluate` enable editing and catalog-validated connections (Day 15).
 */
export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
