import type { CommitMeta } from '../lib/queries';

interface HistoryPanelProps {
  commits: CommitMeta[];
  loading: boolean;
  /** The (up to two) selected commit hashes being compared. */
  selected: string[];
  onToggleSelect: (hash: string) => void;
  onRestore: (hash: string) => void;
}

const ORIGIN_COLOR: Record<string, string> = {
  manual: '#475569',
  ai: '#7c3aed',
  import: '#0891b2',
  restore: '#16a34a',
};

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, '').slice(0, 7);
}

/** History panel: commit list with origin badge, stats, time + select-two-to-diff & restore. */
export function HistoryPanel({ commits, loading, selected, onToggleSelect, onRestore }: HistoryPanelProps): React.JSX.Element {
  return (
    <aside style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>History</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>Select two commits to compare.</div>
      {loading ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p> : null}
      {commits.map((c) => {
        const isSelected = selected.includes(c.hash);
        return (
          <div
            key={c.hash}
            onClick={() => onToggleSelect(c.hash)}
            style={{
              border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
              background: isSelected ? 'rgba(37,99,235,0.06)' : '#fff',
              borderRadius: 8,
              padding: '8px 10px',
              marginBottom: 8,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  color: '#fff',
                  background: ORIGIN_COLOR[c.origin] ?? '#94a3b8',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                {c.origin}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{shortHash(c.hash)}</span>
            </div>
            <div style={{ fontSize: 13, color: '#1e293b', marginBottom: 4, wordBreak: 'break-word' }}>{c.message || '(no message)'}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {c.stats.components} comp · {c.stats.connections} conn · {c.stats.groups} grp
              {c.stats.providers.length ? ` · ${c.stats.providers.join(', ')}` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(c.createdAt).toLocaleString()}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(c.hash);
                }}
                style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Restore
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderRight: '1px solid #e2e8f0',
  padding: 12,
  overflowY: 'auto',
  fontFamily: 'system-ui, sans-serif',
};
