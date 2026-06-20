import { memo } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import type { Severity } from '../lib/queries';

/** Card geometry — kept in sync with the projector's NODE_W / NODE_H. */
const NODE_W = 210;
const NODE_H = 72;

/** Below this zoom the node renders as a low-detail chip (perf at scale, doc 06). */
const LOD_ZOOM = 0.4;

/** Connection handle styling — small, neutral, unobtrusive until hovered. */
const handleStyle = {
  width: 8,
  height: 8,
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
        top: -6,
        right: -6,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: SEVERITY_COLOR[severity],
        border: '2px solid #fff',
        boxShadow: '0 1px 2px rgba(15,23,42,0.3)',
        zIndex: 1,
      }}
    />
  );
}

/** Humanize an abstract type's leaf for the card subtitle, e.g. `compute.vm.autoscaling_group` → `Autoscaling group`. */
function prettyType(type?: string): string {
  if (!type) return '';
  const leaf = type.split('.').pop() ?? type;
  const words = leaf.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A component node: icon + name + role (blueprint doc 06). Memoized + zoom-LOD'd. */
function ServiceNodeImpl({ data, selected }: NodeProps) {
  const d = data as { name?: string; type?: string; service?: string; diffStatus?: DiffStatus; findingSeverity?: Severity };
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  // Boolean selector → this node only re-renders when it crosses the LOD threshold.
  const lowDetail = useStore((s) => s.transform[2] < LOD_ZOOM);
  const accent = diffColor ?? findingColor;
  const border = accent ? `2px solid ${accent}` : selected ? '1.5px solid #2563eb' : '1px solid #e5e7eb';
  const subtitle = d.service ?? prettyType(d.type);

  const shell: React.CSSProperties = {
    position: 'relative',
    width: NODE_W,
    height: NODE_H,
    boxSizing: 'border-box',
    background: '#ffffff',
    border,
    opacity: d.diffStatus === 'removed' ? 0.55 : 1,
    borderRadius: 14,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.18), 0 4px 12px rgba(15,23,42,0.10)'
      : '0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.10)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  if (lowDetail) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px' }}>
        {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
        <Handle type="target" position={Position.Left} style={handleStyle} />
        <div style={{ fontWeight: 700, fontSize: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
        <Handle type="source" position={Position.Right} style={handleStyle} />
      </div>
    );
  }

  return (
    <div style={{ ...shell, display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px' }}>
      {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
      <Handle type="target" position={Position.Left} style={handleStyle} />
      {d.service ? (
        <img
          src={`/api/v1/catalog/icons/${d.service}`}
          width={40}
          height={40}
          alt=""
          style={{ borderRadius: 9, flexShrink: 0, boxShadow: '0 1px 2px rgba(15,23,42,0.12)' }}
        />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 9, background: '#f1f5f9', flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subtitle}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeImpl);
