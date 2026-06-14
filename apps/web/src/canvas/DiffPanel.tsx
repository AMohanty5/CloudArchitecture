import { DIFF_COLOR } from './diffView';
import type { DiffResult, ModifiedElement, PropertyChange } from '../lib/queries';

interface DiffPanelProps {
  diff: DiffResult;
  loading: boolean;
  onExit: () => void;
}

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, '').slice(0, 7);
}

function val(v: unknown): string {
  if (v === undefined) return '∅';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function ChangeRow({ symbol, color, label }: { symbol: string; color: string; label: string }): React.JSX.Element {
  return (
    <div style={{ fontSize: 12, color, display: 'flex', gap: 6, marginBottom: 2 }}>
      <span style={{ fontWeight: 700 }}>{symbol}</span>
      <span style={{ wordBreak: 'break-word' }}>{label}</span>
    </div>
  );
}

function PropChanges({ changes }: { changes: PropertyChange[] }): React.JSX.Element {
  return (
    <div style={{ marginLeft: 18, marginBottom: 4 }}>
      {changes.map((c) => (
        <div key={c.path} style={{ fontSize: 11, color: '#64748b' }}>
          {c.path}: {val(c.before)} → {val(c.after)}
        </div>
      ))}
    </div>
  );
}

interface Section {
  title: string;
  added: { id: string; name?: string }[];
  removed: { id: string; name?: string }[];
  modified: ModifiedElement[];
  label: (item: { id: string; name?: string }) => string;
}

/** Diff change-list sidebar (blueprint doc 06): typed ModelDiff → human-readable changes. */
export function DiffPanel({ diff, loading, onExit }: DiffPanelProps): React.JSX.Element {
  const d = diff.diff;
  const connLabel = (c: { id: string; from?: string; to?: string; kind?: string }): string =>
    c.from ? `${c.from} → ${c.to} (${c.kind})` : c.id;

  const sections: Section[] = [
    { title: 'Components', ...d.components, label: (i) => i.name ?? i.id },
    { title: 'Connections', ...d.connections, label: (i) => connLabel(i as { id: string; from?: string; to?: string; kind?: string }) },
    { title: 'Groups', ...d.groups, label: (i) => i.name ?? i.id },
  ];

  const empty = sections.every((s) => s.added.length + s.removed.length + s.modified.length === 0) && d.document.length === 0;

  return (
    <aside style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Diff</div>
        <button onClick={onExit} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
          Exit diff
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 10 }}>
        {shortHash(diff.from)} → {shortHash(diff.to)}
      </div>
      {loading ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p> : null}
      {!loading && empty ? <p style={{ fontSize: 13, color: '#94a3b8' }}>No changes between these commits.</p> : null}

      {sections.map((s) =>
        s.added.length + s.removed.length + s.modified.length === 0 ? null : (
          <div key={s.title} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', marginBottom: 4 }}>{s.title}</div>
            {s.added.map((i) => (
              <ChangeRow key={i.id} symbol="+" color={DIFF_COLOR.added} label={s.label(i)} />
            ))}
            {s.removed.map((i) => (
              <ChangeRow key={i.id} symbol="−" color={DIFF_COLOR.removed} label={s.label(i)} />
            ))}
            {s.modified.map((m) => (
              <div key={m.id}>
                <ChangeRow symbol="~" color={DIFF_COLOR.modified} label={m.id} />
                <PropChanges changes={m.changes} />
              </div>
            ))}
          </div>
        ),
      )}

      {d.document.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', marginBottom: 4 }}>Document</div>
          <PropChanges changes={d.document} />
        </div>
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
