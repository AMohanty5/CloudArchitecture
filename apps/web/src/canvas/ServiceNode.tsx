import { memo } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import { roleLabel } from './roleLabels';
import { FOLD, FONT, NEUTRAL, NODE, RADIUS, SHADOW, TYPE_SCALE } from './theme';
import type { FoldItem } from './projector';
import type { Severity } from '../lib/queries';

/** A small catalog icon (attachment rows / chips), with a neutral placeholder fallback. */
function SmallIcon({ service, size }: { service?: string; size: number }): React.JSX.Element {
  return service ? (
    <img src={`/api/v1/catalog/icons/${service}`} width={size} height={size} alt="" style={{ borderRadius: 4, flexShrink: 0 }} />
  ) : (
    <span style={{ width: size, height: size, borderRadius: 4, background: '#f1f5f9', flexShrink: 0 }} />
  );
}

/** A security/identity badge chip folded onto a node (Day 53). */
function Chip({ glyph, label }: { glyph: string; label: string }): React.JSX.Element {
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        maxWidth: 82,
        padding: '1px 6px',
        borderRadius: 6,
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        fontSize: 9.5,
        color: NEUTRAL.subtle,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: 9 }}>{glyph}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  );
}

/** Compact architecture-block geometry — kept in sync with the projector's NODE_W / NODE_H. */
const NODE_W = NODE.width;
const NODE_H = NODE.height;

/** Below this zoom the node renders as a low-detail chip (perf at scale, doc 06). */
const LOD_ZOOM = 0.4;

/** Connection handle styling — small, neutral, unobtrusive until hovered. */
const handleStyle = {
  width: 7,
  height: 7,
  background: '#fff',
  border: '1.5px solid #94a3b8',
};

/**
 * Handles on all four sides so a node can be connected from whichever edge faces its
 * neighbour — vertically-stacked resources in a subnet were unreachable with only
 * left/right handles (Day 51 Blocker C). The canvas runs in `ConnectionMode.Loose`, so
 * any handle may originate or receive a connection; the catalog verdict still governs
 * validity. Unique ids keep React Flow from collapsing same-type handles.
 */
function NodeHandles(): React.JSX.Element {
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} style={handleStyle} />
      <Handle id="l" type="target" position={Position.Left} style={handleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
    </>
  );
}

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
  const d = data as {
    name?: string;
    type?: string;
    service?: string;
    diffStatus?: DiffStatus;
    findingSeverity?: Severity;
    attachments?: FoldItem[];
    security?: FoldItem[];
    identity?: FoldItem[];
  };
  const attachments = d.attachments ?? [];
  const security = d.security ?? [];
  const identity = d.identity ?? [];
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  // Boolean selector → this node only re-renders when it crosses the LOD threshold.
  const lowDetail = useStore((s) => s.transform[2] < LOD_ZOOM);
  const accent = diffColor ?? findingColor;
  const border = accent ? `2px solid ${accent}` : selected ? '1.5px solid #2563eb' : '1px solid var(--cac-hairline, #e5e7eb)';
  const role = roleLabel(d.type); // role subtitle, not the catalog id

  const shell: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%', // fill the projector-sized node box (taller when it carries folds)
    boxSizing: 'border-box',
    background: 'var(--cac-surface, #ffffff)',
    border,
    opacity: d.diffStatus === 'removed' ? 0.55 : 1,
    borderRadius: RADIUS.node,
    boxShadow: selected ? SHADOW.nodeSelected : SHADOW.node,
    fontFamily: FONT,
    overflow: 'hidden',
  };

  if (lowDetail) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>
        {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
        <NodeHandles />
        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--cac-text, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
      </div>
    );
  }

  const hasBadges = security.length > 0 || identity.length > 0;
  return (
    <div style={{ ...shell, display: 'flex', flexDirection: 'column' }}>
      {d.findingSeverity ? <FindingDot severity={d.findingSeverity} /> : null}
      <NodeHandles />
      {/* Header: category icon + the dominant name. Role/type are hover-only (title). */}
      <div
        title={role ? `${role} · ${d.type}` : d.type}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 9px', height: NODE_H, boxSizing: 'border-box', flexShrink: 0 }}
      >
        {d.service ? (
          <img src={`/api/v1/catalog/icons/${d.service}`} width={NODE.iconSize} height={NODE.iconSize} alt="" style={{ borderRadius: 7, flexShrink: 0 }} />
        ) : (
          <div style={{ width: NODE.iconSize, height: NODE.iconSize, borderRadius: 7, background: '#f1f5f9', flexShrink: 0 }} />
        )}
        <div
          style={{ fontWeight: 600, fontSize: TYPE_SCALE.name, color: 'var(--cac-text, #1e293b)', lineHeight: 1.3, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {d.name}
        </div>
      </div>
      {/* ATTACHED_TO: each attached resource as a compartment row inside the owner. */}
      {attachments.map((a) => (
        <div
          key={a.id}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: FOLD.compartmentH, padding: '0 9px', boxSizing: 'border-box', borderTop: '1px dashed #e5e7eb', flexShrink: 0 }}
        >
          <SmallIcon service={a.service} size={16} />
          <span style={{ fontSize: 11, color: 'var(--cac-text, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{a.name}</span>
          <span style={{ fontSize: 8.5, color: NEUTRAL.muted, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 }}>attached</span>
        </div>
      ))}
      {/* SECURED_BY + ASSUMES: badge chips, never lines. */}
      {hasBadges ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: FOLD.badgeRowH, padding: '0 9px', boxSizing: 'border-box', borderTop: '1px solid #f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
          {security.map((s) => (
            <Chip key={s.id} glyph="🛡" label={s.name} />
          ))}
          {identity.map((i) => (
            <Chip key={i.id} glyph="🔐" label={i.name} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeImpl);
