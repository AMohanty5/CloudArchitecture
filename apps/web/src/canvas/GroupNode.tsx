import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import { FONT, kindColor, rgba } from './theme';
import type { Severity } from '../lib/queries';

/** A containment box (region / VPC / subnet / tier) with a kind-styled, labelled header. */
function GroupNodeImpl({ data, selected }: NodeProps) {
  const d = data as { label?: string; kind?: string; invalid?: boolean; diffStatus?: DiffStatus; findingSeverity?: Severity };
  const base = kindColor(d.kind);
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  const borderColor = diffColor ?? findingColor ?? (d.invalid ? '#ef4444' : selected ? '#2563eb' : rgba(base, 0.45));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        background: rgba(base, 0.035),
        boxShadow: selected ? `0 0 0 3px ${rgba(base, 0.18)}` : '0 1px 3px rgba(15,23,42,0.05)',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
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
          background: rgba(base, 0.10),
          borderBottom: `1px solid ${rgba(base, 0.20)}`,
        }}
      >
        {d.invalid ? <span title="Containment rule violated">⚠️</span> : null}
        {findingColor ? (
          <span
            title={`${d.findingSeverity} finding`}
            style={{ width: 9, height: 9, borderRadius: '50%', background: findingColor, flexShrink: 0 }}
          />
        ) : null}
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: rgba(base, 0.7), flexShrink: 0 }}>
          {d.kind}
        </span>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
