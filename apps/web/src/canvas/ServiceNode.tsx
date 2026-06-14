import { memo } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';

/** Below this zoom the node renders as a low-detail chip (perf at scale, doc 06). */
const LOD_ZOOM = 0.4;

/** A component node: icon + name + binding badge (blueprint doc 06). Memoized + zoom-LOD'd. */
function ServiceNodeImpl({ data, selected }: NodeProps) {
  const d = data as { name?: string; type?: string; service?: string; diffStatus?: DiffStatus };
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  // Boolean selector → this node only re-renders when it crosses the LOD threshold.
  const lowDetail = useStore((s) => s.transform[2] < LOD_ZOOM);
  const border = diffColor ? `2px solid ${diffColor}` : selected ? '1px solid #2563eb' : '1px solid #cbd5e1';

  if (lowDetail) {
    return (
      <div
        style={{
          width: 190,
          height: 64,
          boxSizing: 'border-box',
          background: '#fff',
          border,
          opacity: d.diffStatus === 'removed' ? 0.55 : 1,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <div style={{ fontWeight: 700, fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 190,
        height: 64,
        boxSizing: 'border-box',
        background: '#ffffff',
        border,
        opacity: d.diffStatus === 'removed' ? 0.55 : 1,
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: selected ? '0 0 0 2px rgba(37,99,235,0.35)' : '0 1px 2px rgba(15,23,42,0.06)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {d.service ? <img src={`/api/v1/catalog/icons/${d.service}`} width={26} height={26} alt="" /> : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.name}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{d.type}</div>
        </div>
      </div>
      {d.service ? (
        <span style={{ alignSelf: 'flex-start', fontSize: 10, color: '#475569', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>
          {d.service}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeImpl);
