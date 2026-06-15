import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import type { Severity } from '../lib/queries';

/** Header tint per group kind (blueprint doc 06: kind-styled containers). */
const KIND_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  network: { bg: 'rgba(37,99,235,0.10)', fg: '#1d4ed8', border: '#bfdbfe' },
  subnet: { bg: 'rgba(13,148,136,0.10)', fg: '#0f766e', border: '#99f6e4' },
  region: { bg: 'rgba(124,58,237,0.10)', fg: '#6d28d9', border: '#ddd6fe' },
  zone: { bg: 'rgba(217,119,6,0.10)', fg: '#b45309', border: '#fde68a' },
  tier: { bg: 'rgba(100,116,139,0.10)', fg: '#475569', border: '#e2e8f0' },
};
const DEFAULT_STYLE = { bg: 'rgba(148,163,184,0.10)', fg: '#475569', border: '#e2e8f0' };

/** A containment box (region / VPC / subnet / tier) with a kind-styled, labelled header. */
function GroupNodeImpl({ data, selected }: NodeProps) {
  const d = data as { label?: string; kind?: string; invalid?: boolean; diffStatus?: DiffStatus; findingSeverity?: Severity };
  const k = KIND_STYLE[d.kind ?? ''] ?? DEFAULT_STYLE;
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: diffColor
          ? `2px solid ${diffColor}`
          : findingColor
            ? `2px solid ${findingColor}`
            : selected
              ? '1px solid #2563eb'
              : `1px solid ${d.invalid ? '#fca5a5' : k.border}`,
        borderRadius: 12,
        background: k.bg,
        boxShadow: selected ? '0 0 0 2px rgba(37,99,235,0.30)' : undefined,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: k.fg,
          borderBottom: `1px solid ${k.border}`,
        }}
      >
        {d.invalid ? <span title="Containment rule violated">⚠️</span> : null}
        {findingColor ? (
          <span
            title={`${d.findingSeverity} finding`}
            style={{ width: 9, height: 9, borderRadius: '50%', background: findingColor, flexShrink: 0 }}
          />
        ) : null}
        {d.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {d.kind}</span>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
