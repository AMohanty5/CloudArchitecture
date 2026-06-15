import type { Finding, ValidationReport } from '../lib/queries';
import { SEVERITY_COLOR, SEVERITY_ORDER } from './validationView';

interface ValidationPanelProps {
  report: ValidationReport | undefined;
  loading: boolean;
  selectedId?: string;
  onSelectTarget: (id: string) => void;
  onFix: (finding: Finding) => void;
  onRefresh: () => void;
}

function FindingCard({
  finding,
  active,
  onSelect,
  onFix,
}: {
  finding: Finding;
  active: boolean;
  onSelect: () => void;
  onFix: () => void;
}): React.JSX.Element {
  const color = SEVERITY_COLOR[finding.severity];
  return (
    <div
      onClick={onSelect}
      style={{
        background: active ? '#f8fafc' : '#fff',
        border: '1px solid #e2e8f0',
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 8,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color }}>{finding.severity}</span>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{finding.ruleId}</span>
      </div>
      <div style={{ fontSize: 12, color: '#1e293b', marginBottom: finding.remediation ? 3 : 0 }}>{finding.message}</div>
      {finding.remediation ? <div style={{ fontSize: 11, color: '#64748b' }}>→ {finding.remediation}</div> : null}
      {finding.fix ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFix();
          }}
          style={{
            marginTop: 6,
            padding: '3px 10px',
            borderRadius: 5,
            border: '1px solid #16a34a',
            background: '#f0fdf4',
            color: '#15803d',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          ⚡ Fix automatically
        </button>
      ) : null}
    </div>
  );
}

/** Validation findings sidebar (blueprint doc 16): advisory, severity-graded, read-only. */
export function ValidationPanel({ report, loading, selectedId, onSelectTarget, onFix, onRefresh }: ValidationPanelProps): React.JSX.Element {
  const findings = report?.findings ?? [];
  const counts = report?.summary.bySeverity;

  return (
    <aside style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Validation</div>
        <button onClick={onRefresh} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
          Re-run
        </button>
      </div>

      {counts ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} style={{ fontSize: 11, color: '#fff', background: SEVERITY_COLOR[s], borderRadius: 10, padding: '1px 8px' }}>
              {counts[s]} {s}
            </span>
          ))}
        </div>
      ) : null}

      {loading ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Running rules…</p> : null}
      {!loading && findings.length === 0 ? (
        <p style={{ fontSize: 13, color: '#16a34a' }}>✓ No findings — the baseline rule pack is clean.</p>
      ) : null}

      {findings.map((f, i) => (
        <FindingCard
          key={`${f.ruleId}:${f.targetId}:${i}`}
          finding={f}
          active={f.targetId === selectedId}
          onSelect={() => onSelectTarget(f.targetId)}
          onFix={() => onFix(f)}
        />
      ))}

      {report ? (
        <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 8 }}>pack {report.packVersion}</div>
      ) : null}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  borderLeft: '1px solid #e2e8f0',
  padding: 14,
  overflowY: 'auto',
  fontFamily: 'system-ui, sans-serif',
};
