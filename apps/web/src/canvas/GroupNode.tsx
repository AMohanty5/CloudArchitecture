import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { DIFF_COLOR } from './diffView';
import type { DiffStatus } from './diffView';
import { SEVERITY_COLOR } from './validationView';
import { roleLabel } from './roleLabels';
import { CONTAINER, FONT, NEUTRAL, RADIUS, SUBNET_TINT, TYPE_SCALE, kindColor, rgba } from './theme';
import type { Severity } from '../lib/queries';

/** A row in a section panel (Day 41): a component rendered compactly inside its tier group. */
interface SectionItem {
  id: string;
  name?: string;
  type?: string;
  service?: string;
}

const groupHandleStyle = { width: 7, height: 7, background: '#fff', border: '1.5px solid #94a3b8' };

/** Four-sided edge anchors so a container connects from any edge. */
function GroupHandles(): React.JSX.Element {
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} style={groupHandleStyle} />
      <Handle id="l" type="target" position={Position.Left} style={groupHandleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={groupHandleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={groupHandleStyle} />
    </>
  );
}

/** A 🛡 security chip (NACL/SG folded onto the container, Day 55). */
function SecurityChip({ name, base }: { name: string; base: string }): React.JSX.Element {
  return (
    <span
      title={`Secured by ${name}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 6px', borderRadius: 6, background: 'var(--cac-surface, #fff)', border: `1px solid ${rgba(base, 0.3)}`, fontSize: 9, fontWeight: 500, color: 'var(--cac-muted, #64748b)', flexShrink: 0 }}
    >
      <span aria-hidden>🛡</span>
      <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
    </span>
  );
}

const KIND_WASH: Record<string, number> = {
  region: CONTAINER.wash.region,
  network: CONTAINER.wash.network,
  zone: CONTAINER.wash.zone,
  subnet: CONTAINER.wash.subnetPrivate,
};
const KIND_BORDER: Record<string, number> = {
  region: CONTAINER.borderAlpha.region,
  network: CONTAINER.borderAlpha.network,
  zone: CONTAINER.borderAlpha.zone,
  subnet: CONTAINER.borderAlpha.subnet,
};

/**
 * A containment boundary. Tier "section panels" keep their bordered, header-barred panel
 * look (an intentional UI panel, Day 41). Structural containers (region / VPC / subnet) are
 * *demoted* (Day 58): a faint monochrome wash + a near-invisible hairline + a quiet corner
 * label, so the boundary reads as context, not a cage. Whitespace over borders.
 */
function GroupNodeImpl({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    kind?: string;
    items?: SectionItem[];
    invalid?: boolean;
    diffStatus?: DiffStatus;
    findingSeverity?: Severity;
    security?: Array<{ id: string; name: string }>;
    public?: boolean;
  };
  const security = d.security ?? [];
  // Subnets are tinted public (sky) vs private (slate); AZ bands are a quiet slate, lighter
  // than the VPC; everything else by kind.
  const isSubnet = d.kind === 'subnet';
  const isZone = d.kind === 'zone';
  const base = isSubnet ? (d.public ? SUBNET_TINT.public : SUBNET_TINT.private) : isZone ? '#64748b' : kindColor(d.kind);
  const diffColor = d.diffStatus ? DIFF_COLOR[d.diffStatus] : undefined;
  const findingColor = d.findingSeverity ? SEVERITY_COLOR[d.findingSeverity] : undefined;
  const feedback = diffColor ?? findingColor ?? (d.invalid ? '#ef4444' : selected ? '#2563eb' : undefined);
  const items = d.items ?? [];
  const isSection = items.length > 0;

  const labelRow = (
    <>
      {d.invalid ? <span title="Containment rule violated">⚠️</span> : null}
      {findingColor ? (
        <span title={`${d.findingSeverity} finding`} style={{ width: 9, height: 9, borderRadius: '50%', background: findingColor, flexShrink: 0 }} />
      ) : null}
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
      {security.map((s) => (
        <SecurityChip key={s.id} name={s.name} base={base} />
      ))}
    </>
  );

  // --- Section panel (tier groups): the intentional panel look, unchanged. ---
  if (isSection) {
    return (
      <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: `1.5px solid ${feedback ?? rgba(base, 0.45)}`, borderRadius: RADIUS.group, background: 'var(--cac-surface, #ffffff)', boxShadow: selected ? `0 0 0 3px ${rgba(base, 0.18)}` : '0 1px 3px rgba(15,23,42,0.05)', fontFamily: FONT, overflow: 'hidden' }}>
        <GroupHandles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: base, background: rgba(base, 0.1), borderBottom: `1px solid ${rgba(base, 0.2)}` }}>
          {labelRow}
        </div>
        <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column' }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 4px' }}>
              {it.service ? (
                <img src={`/api/v1/catalog/icons/${it.service}`} width={18} height={18} alt="" style={{ borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 18, height: 18, borderRadius: 4, background: '#f1f5f9', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 11.5, color: 'var(--cac-text, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: NEUTRAL.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{roleLabel(it.type)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Structural container (region / VPC / subnet): demoted to wash + corner label. ---
  const kind = d.kind ?? '';
  const wash = isSubnet
    ? d.public
      ? CONTAINER.wash.subnetPublic
      : CONTAINER.wash.subnetPrivate
    : (KIND_WASH[kind] ?? CONTAINER.wash.default);
  const borderAlpha = KIND_BORDER[kind] ?? CONTAINER.borderAlpha.default;
  const isRegion = kind === 'region';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: `1px ${isZone ? 'dashed' : 'solid'} ${feedback ?? rgba(base, borderAlpha)}`,
        borderRadius: RADIUS.group,
        background: rgba(base, wash),
        boxShadow: selected ? `0 0 0 3px ${rgba(base, 0.18)}` : 'none',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      <GroupHandles />
      {/* Quiet corner label — no header bar, no kind suffix. */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 11px',
          fontSize: isRegion ? TYPE_SCALE.region : TYPE_SCALE.label,
          fontWeight: 600,
          letterSpacing: 0.2,
          color: isRegion ? rgba(base, 0.65) : rgba(base, 0.8),
        }}
      >
        {labelRow}
        {isSubnet ? (
          <span style={{ padding: '0 6px', borderRadius: 6, background: rgba(base, 0.12), fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: rgba(base, 0.9) }}>
            {d.public ? 'public' : 'private'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
