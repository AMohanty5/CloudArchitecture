import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArchitectureSummary } from '../lib/queries';
import { exportUrls, lifecycleMeta, relativeTime, thumbnailUrl, useArchScore, useInView } from '../lib/useArchHub';

/** Star toggle (favorite). */
function Star({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={on ? 'Unfavorite' : 'Favorite'}
      title={on ? 'Unfavorite' : 'Favorite'}
      style={{ border: 'none', background: 'rgba(255,255,255,0.85)', borderRadius: 6, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '3px 5px', color: on ? '#f59e0b' : '#94a3b8' }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

/** Validation-score chip — lazily fetched once the card scrolls into view. */
function ScoreChip({ id, branch, inView }: { id: string; branch: string; inView: boolean }) {
  const { data, isLoading } = useArchScore(id, branch, inView);
  if (!inView || isLoading || !data) return null;
  const color = data.score >= 90 ? '#10b981' : data.score >= 70 ? '#f59e0b' : '#dc2626';
  return (
    <span
      title={`${data.errors} error(s), ${data.warnings} warning(s)`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color, background: `${color}1a`, borderRadius: 10, padding: '1px 7px' }}
    >
      {data.score}
      {data.errors > 0 ? <span style={{ color: '#dc2626' }}>✗{data.errors}</span> : data.warnings > 0 ? <span style={{ color: '#f59e0b' }}>⚠{data.warnings}</span> : <span>✓</span>}
    </span>
  );
}

export type CardAction = 'rename' | 'duplicate' | 'archive' | 'delete';

interface CardProps {
  arch: ArchitectureSummary;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
  onAction: (action: CardAction, arch: ArchitectureSummary) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

export function ArchitectureCard({ arch, isFavorite, onToggleFavorite, onOpen, onAction, selected, onToggleSelect }: CardProps) {
  const navigate = useNavigate();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const status = lifecycleMeta(arch.lifecycle);
  const branch = arch.defaultBranch;
  const urls = exportUrls(arch.id, branch);

  const open = () => {
    onOpen(arch.id);
    navigate(`/architectures/${arch.id}`);
  };

  return (
    <div
      ref={ref}
      style={{ position: 'relative', border: `1px solid ${selected ? '#2563eb' : '#e2e8f0'}`, borderRadius: 12, background: '#fff', boxShadow: selected ? '0 0 0 1px #2563eb, 0 1px 2px rgba(15,23,42,0.05)' : '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* Select checkbox */}
      <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(arch.id)}
          aria-label={`Select ${arch.name}`}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
        />
      </span>

      {/* Thumbnail (reuses the server SVG renderer) */}
      <button
        onClick={open}
        aria-label={`Open ${arch.name}`}
        style={{ position: 'relative', height: 132, border: 'none', borderBottom: '1px solid #eef2f7', background: '#f8fafc', cursor: 'pointer', padding: 0, display: 'block', width: '100%' }}
      >
        {inView && !thumbFailed ? (
          <img
            src={thumbnailUrl(arch.id, branch)}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#cbd5e1', fontSize: 28 }}>▢</div>
        )}
        <span style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
          <Star on={isFavorite} onClick={(e) => { e.stopPropagation(); onToggleFavorite(arch.id); }} />
        </span>
      </button>

      {/* Body */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arch.name}</span>
          <ScoreChip id={arch.id} branch={branch} inView={inView} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#94a3b8' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.color }} />
            {status.label}
          </span>
          <span>·</span>
          <span>{relativeTime(arch.createdAt)}</span>
        </div>
        {arch.description ? (
          <div style={{ fontSize: 12.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arch.description}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
          <button onClick={open} style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Open
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-haspopup="menu"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
            >
              ⋮
            </button>
            {menuOpen ? (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div role="menu" style={{ position: 'absolute', right: 0, bottom: '110%', zIndex: 11, minWidth: 168, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.16)', padding: 4, fontSize: 13 }}>
                  <div style={{ padding: '4px 8px', fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Export</div>
                  {([['SVG', urls.svg], ['Terraform (.zip)', urls.terraform], ['HLD (.md)', urls.hld], ['Bundle (.zip)', urls.bundle]] as const).map(([label, href]) => (
                    <a key={label} href={href} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '6px 8px', borderRadius: 6, color: '#334155', textDecoration: 'none' }}>
                      {label}
                    </a>
                  ))}
                  <div style={{ borderTop: '1px solid #eef2f7', margin: '4px 0' }} />
                  <button onClick={() => { onToggleFavorite(arch.id); setMenuOpen(false); }} style={menuItemStyle}>
                    {isFavorite ? '★ Unfavorite' : '☆ Favorite'}
                  </button>
                  <button onClick={() => { onAction('rename', arch); setMenuOpen(false); }} style={menuItemStyle}>Rename</button>
                  <button onClick={() => { onAction('duplicate', arch); setMenuOpen(false); }} style={menuItemStyle}>Duplicate</button>
                  {arch.lifecycle !== 'archived' ? (
                    <button onClick={() => { onAction('archive', arch); setMenuOpen(false); }} style={menuItemStyle}>Archive</button>
                  ) : null}
                  <div style={{ borderTop: '1px solid #eef2f7', margin: '4px 0' }} />
                  <button onClick={() => { onAction('delete', arch); setMenuOpen(false); }} style={{ ...menuItemStyle, color: '#dc2626' }}>Delete…</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'none', color: '#334155', fontSize: 13, cursor: 'pointer' };
