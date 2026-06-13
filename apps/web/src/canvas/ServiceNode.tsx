import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

/** A component node: icon + name + binding badge (blueprint doc 06). */
export function ServiceNode({ data }: NodeProps) {
  const d = data as { name?: string; type?: string; service?: string };
  return (
    <div
      style={{
        width: 190,
        height: 64,
        boxSizing: 'border-box',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
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
