import type { PathStep } from './pathfinder';

/**
 * Recommendation panel (Day 100, docs/architecture-intelligence.md §5). When a connection is
 * rejected but the rules graph found intermediary path(s), this replaces the bare reject hint
 * with structured "Suggested architectures" — each a `source → I₁ → … → target` chain with a
 * one-click **Insert** that materializes it (Day 101). Pure presentational + callbacks.
 */
export interface RecommendationPanelProps {
  sourceName: string;
  /** Why the direct connection was rejected (e.g. "route via Lambda"). */
  reason: string;
  /** Suggested paths, best first; each step carries its representative service key. */
  options: PathStep[][];
  nameOf: (serviceKey: string) => string;
  onInsert: (path: PathStep[]) => void;
  onDismiss: () => void;
}

const CIRCLED = ['①', '②', '③', '④', '⑤'];

export function RecommendationPanel({ sourceName, reason, options, nameOf, onInsert, onDismiss }: RecommendationPanelProps) {
  return (
    <div
      role="dialog"
      aria-label="Suggested architectures"
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--cac-surface, #ffffff)',
        border: '1px solid var(--cac-hairline, #e2e8f0)',
        color: 'var(--cac-text, #0f172a)',
        padding: '12px 14px',
        borderRadius: 10,
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 6px 24px rgba(15,23,42,0.18)',
        zIndex: 6,
        minWidth: 320,
        maxWidth: 560,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, color: '#b45309' }}>⚠ No direct connection</div>
          <div style={{ color: 'var(--cac-muted, #64748b)', marginTop: 2 }}>{reason}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ border: 'none', background: 'transparent', color: 'var(--cac-muted, #64748b)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((path, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'var(--cac-muted, #64748b)', marginRight: 6 }}>{CIRCLED[i] ?? '•'}</span>
              {sourceName}
              {path.map((step, j) => (
                <span key={j}>
                  {' → '}
                  <strong style={{ fontWeight: j === path.length - 1 ? 400 : 600 }}>{nameOf(step.serviceKey)}</strong>
                </span>
              ))}
            </span>
            <button
              type="button"
              onClick={() => onInsert(path)}
              style={{
                border: '1px solid #2563eb',
                background: '#2563eb',
                color: '#ffffff',
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Insert
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
