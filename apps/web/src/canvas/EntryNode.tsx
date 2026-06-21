import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FONT, NODE } from './theme';

/**
 * The synthesized "Internet / Users" flow origin (Day 63). A quiet rounded pill, not a
 * service card — it sets the left-to-right reading direction without competing with the
 * real architecture. Four-sided handles so its edges connect under ConnectionMode.Loose.
 */
function EntryNodeImpl(): React.JSX.Element {
  const handle = { width: 6, height: 6, background: 'var(--cac-surface, #fff)', border: '1.5px solid #94a3b8' };
  return (
    <div
      style={{
        width: NODE.width,
        height: NODE.height,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 999,
        border: '1px dashed var(--cac-hairline, #cbd5e1)',
        background: 'var(--cac-surface, #ffffff)',
        color: 'var(--cac-muted, #64748b)',
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Handle id="t" type="target" position={Position.Top} style={handle} />
      <Handle id="l" type="target" position={Position.Left} style={handle} />
      <Handle id="r" type="source" position={Position.Right} style={handle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handle} />
      <span aria-hidden style={{ fontSize: 16 }}>🌐</span>
      <span>Internet</span>
    </div>
  );
}

export const EntryNode = memo(EntryNodeImpl);
