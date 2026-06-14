import { useCallback, useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Connection, Edge, Node, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { project } from './projector';
import type { LayoutSidecar, ProjectableModel } from './projector';
import { ServiceNode } from './ServiceNode';
import { GroupNode } from './GroupNode';
import { SERVICE_DRAG_MIME } from './commands';
import type { ServiceLike } from './commands';

const nodeTypes: NodeTypes = { service: ServiceNode, group: GroupNode };

/** Verdict for a candidate edge, resolved by the editor from catalog rules. */
export interface ConnectVerdict {
  allowed: boolean;
  reason?: string;
}

interface CanvasProps {
  model: ProjectableModel;
  layout?: LayoutSidecar;
  /** When provided, the canvas accepts palette drops and emits the dropped service + flow position. */
  onDropService?: (service: ServiceLike, position: { x: number; y: number }) => void;
  /** Currently-selected node id; when `onSelect` is provided the canvas is selectable. */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  /** Currently-selected edge id. */
  selectedEdgeId?: string;
  onSelectEdge?: (id: string | undefined) => void;
  /** Catalog verdict for a candidate edge; when provided, the canvas allows drawing connections. */
  evaluate?: (source: string, target: string) => ConnectVerdict;
  onConnect?: (source: string, target: string) => void;
}

/** Inner flow — lives inside ReactFlowProvider so it can use the instance for screen→flow coords. */
function Flow({ model, layout, onDropService, selectedId, onSelect, selectedEdgeId, onSelectEdge, evaluate, onConnect }: CanvasProps) {
  const { nodes, edges } = useMemo(() => project(model, layout), [model, layout]);
  const selectedNodes = useMemo(() => nodes.map((n) => ({ ...n, selected: n.id === selectedId })), [nodes, selectedId]);
  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        selected: e.id === selectedEdgeId,
        style: { ...e.style, strokeWidth: e.id === selectedEdgeId ? 3 : 1.5 },
      })),
    [edges, selectedEdgeId],
  );
  const { screenToFlowPosition } = useReactFlow();
  const editable = Boolean(onDropService);
  const selectable = Boolean(onSelect || onSelectEdge);
  const connectable = Boolean(onConnect);

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
      onDropService(service, position);
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }} onDragOver={editable ? onDragOver : undefined} onDrop={editable ? onDrop : undefined}>
      <ReactFlow
        nodes={selectedNodes as unknown as Node[]}
        edges={styledEdges as unknown as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
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
        isValidConnection={connectable ? isValidConnection : undefined}
        onConnect={connectable ? handleConnect : undefined}
        onConnectStart={() => showHint(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {hint ? (
        <div
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
