import type { NodeProps } from '@xyflow/react';

/** A containment box (region / VPC / subnet / tier) with a labelled header. */
export function GroupNode({ data }: NodeProps) {
  const d = data as { label?: string; kind?: string };
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        background: 'rgba(148,163,184,0.06)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
        {d.label} <span style={{ fontWeight: 400, color: '#94a3b8' }}>· {d.kind}</span>
      </div>
    </div>
  );
}
