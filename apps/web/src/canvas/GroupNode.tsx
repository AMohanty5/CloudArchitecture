import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import { roleLabel } from './roleLabels';
import { FONT, NEUTRAL, kindColor, rgba } from './theme';
import type { Severity } from '../lib/queries';

/** A row in a section panel (Day 41): a component rendered compactly inside its tier group. */
interface SectionItem {
  id: string;
  name?: string;
  type?: string;
  service?: string;
}

const groupHandleStyle = { width: 7, height: 7, background: '#fff', border: '1.5px solid #94a3b8' };

/** A containment box (region / VPC / subnet / tier) with a kind-styled, labelled header. */
function GroupNodeImpl({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    kind?: string;
    items?: SectionItem[];
    invalid?: boolean;
    diffStatus?: DiffStatus;
    findingSeverity?: Severity;
  };
  const base = kindColor(d.kind);
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  const borderColor = diffColor ?? findingColor ?? (d.invalid ? '#ef4444' : selected ? '#2563eb' : rgba(base, 0.45));
  const items = d.items ?? [];
  const isSection = items.length > 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        background: isSection ? '#ffffff' : rgba(base, 0.035),
        boxShadow: selected ? `0 0 0 3px ${rgba(base, 0.18)}` : '0 1px 3px rgba(15,23,42,0.05)',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {/* Container-to-container edge anchors (used when section rows remap their edges here). */}
      <Handle type="target" position={Position.Left} style={groupHandleStyle} />
      <Handle type="source" position={Position.Right} style={groupHandleStyle} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: base,
          background: rgba(base, 0.1),
          borderBottom: `1px solid ${rgba(base, 0.2)}`,
        }}
      >
        {d.invalid ? <span title="Containment rule violated">⚠️</span> : null}
        {findingColor ? (
          <span title={`${d.findingSeverity} finding`} style={{ width: 9, height: 9, borderRadius: '50%', background: findingColor, flexShrink: 0 }} />
        ) : null}
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: rgba(base, 0.7), flexShrink: 0 }}>{d.kind}</span>
      </div>
      {isSection ? (
        <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column' }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 4px' }}>
              {it.service ? (
                <img src={`/api/v1/catalog/icons/${it.service}`} width={18} height={18} alt="" style={{ borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 18, height: 18, borderRadius: 4, background: '#f1f5f9', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 11.5, color: NEUTRAL.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: NEUTRAL.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{roleLabel(it.type)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
