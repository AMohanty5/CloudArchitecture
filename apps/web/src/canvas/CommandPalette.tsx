import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogSearch } from '../lib/queries';
import type { ServiceSummary } from '../lib/queries';
import { TEMPLATES } from './templates';
import type { ArchitectureTemplate } from './templates';
import { SYNTHETIC_CONTAINERS, shortName } from './domains';
import { NEUTRAL } from './theme';

/**
 * Command palette (Day 83, docs/sidebar-redesign.md §5). ⌘K / `/` opens an overlay to
 * **insert by name** — "Create EC2", "Insert 3-Tier template" — faster than dragging from
 * the sidebar. Keyboard-driven (↑/↓/Enter/Esc).
 */

interface Item {
  id: string;
  label: string;
  sub: string;
  iconUrl?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onService,
  onTemplate,
}: {
  open: boolean;
  onClose: () => void;
  onService: (s: ServiceSummary) => void;
  onTemplate: (t: ArchitectureTemplate) => void;
}): React.JSX.Element | null {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useCatalogSearch('');
  const services = useMemo(() => [...SYNTHETIC_CONTAINERS, ...(data ?? [])], [data]);

  const items: Item[] = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const svc: Item[] = ql
      ? services
          .filter((s) => s.name.toLowerCase().includes(ql) || s.key.includes(ql))
          .slice(0, 10)
          .map((s) => ({ id: `s-${s.key}`, label: `Create ${shortName(s.name)}`, sub: s.key, iconUrl: s.iconUrl, run: () => onService(s) }))
      : [];
    const tmpl: Item[] = TEMPLATES.filter((t) => !ql || t.label.toLowerCase().includes(ql)).map((t) => ({
      id: `t-${t.key}`,
      label: `Insert ${t.label}`,
      sub: t.description,
      run: () => onTemplate(t),
    }));
    return [...svc, ...tmpl].slice(0, 12);
  }, [q, services, onService, onTemplate]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);
  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[sel]?.run();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '90vw', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(15,23,42,0.25)', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Create a service or insert a template…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: 'none', borderBottom: '1px solid #e2e8f0', fontSize: 15, outline: 'none' }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {items.length === 0 ? (
            <div style={{ padding: 14, color: '#94a3b8', fontSize: 13 }}>No matches.</div>
          ) : (
            items.map((it, i) => (
              <div
                key={it.id}
                onMouseEnter={() => setSel(i)}
                onClick={() => it.run()}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: i === sel ? '#eff6ff' : 'transparent' }}
              >
                {it.iconUrl ? (
                  <img src={it.iconUrl} width={20} height={20} alt="" style={{ borderRadius: 5, flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }} aria-hidden>◳</span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: NEUTRAL.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                  <div style={{ fontSize: 11, color: NEUTRAL.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '6px 12px', borderTop: '1px solid #f1f5f9', fontSize: 10.5, color: '#94a3b8' }}>↑↓ navigate · ↵ insert · esc close</div>
      </div>
    </div>
  );
}
