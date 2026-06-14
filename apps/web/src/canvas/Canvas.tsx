import { useCallback, useMemo } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { project } from './projector';
import type { LayoutSidecar, ProjectableModel } from './projector';
import { ServiceNode } from './ServiceNode';
import { GroupNode } from './GroupNode';
import { SERVICE_DRAG_MIME } from './commands';
import type { ServiceLike } from './commands';

const nodeTypes: NodeTypes = { service: ServiceNode, group: GroupNode };

interface CanvasProps {
  model: ProjectableModel;
  layout?: LayoutSidecar;
  /** When provided, the canvas accepts palette drops and emits the dropped service + flow position. */
  onDropService?: (service: ServiceLike, position: { x: number; y: number }) => void;
  /** Currently-selected node id; when `onSelect` is provided the canvas is selectable. */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
}

/** Inner flow — lives inside ReactFlowProvider so it can use the instance for screen→flow coords. */
function Flow({ model, layout, onDropService, selectedId, onSelect }: CanvasProps) {
  const { nodes, edges } = useMemo(() => project(model, layout), [model, layout]);
  const selectedNodes = useMemo(() => nodes.map((n) => ({ ...n, selected: n.id === selectedId })), [nodes, selectedId]);
  const { screenToFlowPosition } = useReactFlow();
  const editable = Boolean(onDropService);
  const selectable = Boolean(onSelect);

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

  return (
    <div style={{ width: '100%', height: '100%' }} onDragOver={editable ? onDragOver : undefined} onDrop={editable ? onDrop : undefined}>
      <ReactFlow
        nodes={selectedNodes as unknown as Node[]}
        edges={edges as unknown as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={selectable}
        onNodeClick={onSelect ? (_, node) => onSelect(node.id) : undefined}
        onPaneClick={onSelect ? () => onSelect(undefined) : undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/**
 * Canvas: renders a CAML model via the projector (Day 12, read-only). When
 * `onDropService` is supplied it also accepts palette drops (Day 13), turning each
 * drop into an AddComponent through the editor's CommandBus.
 */
export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
