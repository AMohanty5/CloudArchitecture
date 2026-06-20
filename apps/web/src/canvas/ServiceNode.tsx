import { memo } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import { roleLabel } from './roleLabels';
import type { Severity } from '../lib/queries';

/** Compact architecture-block geometry — kept in sync with the projector's NODE_W / NODE_H. */
const NODE_W = 172;
const NODE_H = 54;

/** Below this zoom the node renders as a low-detail chip (perf at scale, doc 06). */
const LOD_ZOOM = 0.4;

/** Connection handle styling — small, neutral, unobtrusive until hovered. */
const handleStyle = {
  width: 7,
  height: 7,
  background: '#fff',
  border: '1.5px solid #94a3b8',
};

/** A small severity dot anchored to the node corner when a finding targets it (Day 26). */
function FindingDot({ severity }: { severity: Severity }) {
  return (
    <span
      title={`${severity} finding`}
      style={{
        position: 'absolute',
        top: -5,
        right: -5,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: SEVERITY_COLOR[severity],
        border: '2px solid #fff',
        boxShadow: '0 1px 2px rgba(15,23,42,0.3)',
        zIndex: 1,
      }}
    />
  );
}

/** A component node: compact icon + name + role (AWS-reference style). Memoized + zoom-LOD'd. */
function ServiceNodeImpl({ data, selected }: NodeProps) {
  const d = data as { name?: string; type?: string; service?: string; diffStatus?: DiffStatus; findingSeverity?: Severity };
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  // Boolean selector → this node only re-renders when it crosses the LOD threshold.
  const lowDetail = useStore((s) => s.transform[2] < LOD_ZOOM);
  const accent = diffColor ?? findingColor;
  const border = accent ? `2px solid ${accent}` : selected ? '1.5px solid #2563eb' : '1px solid #e5e7eb';
  const role = roleLabel(d.type); // role subtitle, not the catalog id

  const shell: React.CSSProperties = {
    position: 'relative',
    width: NODE_W,
    height: NODE_H,
    boxSizing: 'border-box',
    background: '#ffffff',
    border,
    opacity: d.diffStatus === 'removed' ? 0.55 : 1,
    borderRadius: 10,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.18), 0 2px 8px rgba(15,23,42,0.10)'
      : '0 1px 2px rgba(15,23,42,0.08)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  if (lowDetail) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>
        {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
        <Handle type="target" position={Position.Left} style={handleStyle} />
        <div style={{ fontWeight: 700, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
        <Handle type="source" position={Position.Right} style={handleStyle} />
      </div>
    );
  }

  return (
    <div style={{ ...shell, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px' }}>
      {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
      <Handle type="target" position={Position.Left} style={handleStyle} />
      {d.service ? (
        <img
          src={`/api/v1/catalog/icons/${d.service}`}
          width={30}
          height={30}
          alt=""
          style={{ borderRadius: 7, flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 30, height: 30, borderRadius: 7, background: '#f1f5f9', flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.name}
        </div>
        {role ? (
          <div style={{ fontSize: 9.5, color: '#94a3b8', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {role}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeImpl);
