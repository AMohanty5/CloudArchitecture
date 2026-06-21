import { useMemo, useState } from 'react';
import { useCatalogSearch } from '../lib/queries';
import type { ServiceSummary } from '../lib/queries';
import { SERVICE_DRAG_MIME } from './commands';
import { domainOf, shortName, pushRecent, SYNTHETIC_CONTAINERS, DOMAIN_ORDER, DOMAIN_LABEL, FAVORITE_DEFAULTS } from './domains';
import type { Domain } from './domains';
import { TEMPLATES } from './templates';
import type { ArchitectureTemplate } from './templates';
import { NEUTRAL } from './theme';

function load(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return fallback;
}
function save(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Architecture-first sidebar (Day 79, docs/sidebar-redesign.md). Services are grouped into
 * collapsible domain sections (containers / edge / compute / …), shown as compact draggable
 * tiles with a Compact / Comfortable / Detailed density toggle. Empty domains are hidden.
 */

type Density = 'compact' | 'comfortable' | 'detailed';
const DENSITY_HEIGHT: Record<Density, number> = { compact: 30, comfortable: 46, detailed: 60 };

function matchesQuery(s: ServiceSummary, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || s.name.toLowerCase().includes(t) || s.key.includes(t) || (s.groupKind ?? '').includes(t);
}

/** Bold the matched substring of `text` against the search query. */
function highlighted(text: string, q: string): React.ReactNode {
  const t = q.trim().toLowerCase();
  const i = t ? text.toLowerCase().indexOf(t) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ fontWeight: 800, color: '#2563eb' }}>{text.slice(i, i + t.length)}</span>
      {text.slice(i + t.length)}
    </>
  );
}

function PaletteTile({
  service,
  density,
  favorited,
  onToggleFavorite,
  onRecent,
  query,
  tag,
}: {
  service: ServiceSummary;
  density: Density;
  favorited: boolean;
  onToggleFavorite: (key: string) => void;
  onRecent: (key: string) => void;
  query?: string;
  tag?: string;
}): React.JSX.Element {
  const isGroup = Boolean(service.groupKind);
  const draggable = (service.abstractTypes?.length ?? 0) > 0 || isGroup;
  const icon = density === 'compact' ? 18 : 20;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(service));
        e.dataTransfer.effectAllowed = 'copy';
        onRecent(service.key);
      }}
      title={isGroup ? 'Drag onto the canvas — drop onto a container to nest' : `${service.name} · ${service.key}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: DENSITY_HEIGHT[density],
        padding: '0 4px 0 8px',
        borderRadius: 8,
        background: 'transparent',
        cursor: draggable ? 'grab' : 'not-allowed',
        opacity: draggable ? 1 : 0.5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(148,163,184,0.12)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <img src={service.iconUrl} width={icon} height={icon} alt="" style={{ borderRadius: 5, flexShrink: 0 }} />
      <div style={{ minWidth: 0, lineHeight: 1.2, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NEUTRAL.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {query ? highlighted(shortName(service.name), query) : shortName(service.name)}
        </div>
        {density !== 'compact' ? (
          <div style={{ fontSize: 11, color: NEUTRAL.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{service.name}</div>
        ) : null}
        {density === 'detailed' ? <div style={{ fontSize: 10, color: '#cbd5e1' }}>{service.key}</div> : null}
      </div>
      {tag ? <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0, whiteSpace: 'nowrap' }}>{tag}</span> : null}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(service.key);
        }}
        title={favorited ? 'Unpin' : 'Pin to favorites'}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px', color: favorited ? '#f59e0b' : '#cbd5e1', flexShrink: 0 }}
      >
        {favorited ? '★' : '☆'}
      </button>
    </div>
  );
}

const DENSITIES: Density[] = ['compact', 'comfortable', 'detailed'];

/** Catalog palette: architecture-first domain sections + density modes (doc: sidebar-redesign). */
export function Palette({ onInsertTemplate }: { onInsertTemplate?: (t: ArchitectureTemplate) => void } = {}): React.JSX.Element {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [q, setQ] = useState('');
  const [density, setDensity] = useState<Density>(() => {
    try {
      const d = localStorage.getItem('cac:palette-density');
      return d === 'comfortable' || d === 'detailed' ? d : 'compact';
    } catch {
      return 'compact';
    }
  });
  const setDensityPersist = (d: Density): void => {
    setDensity(d);
    try {
      localStorage.setItem('cac:palette-density', d);
    } catch {
      /* ignore */
    }
  };
  const [collapsed, setCollapsed] = useState<Set<Domain>>(new Set());
  const [favorites, setFavorites] = useState<string[]>(() => load('cac:favorites', [...FAVORITE_DEFAULTS]));
  const [recents, setRecents] = useState<string[]>(() => load('cac:recents', []));
  const toggleFavorite = (key: string): void =>
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      save('cac:favorites', next);
      return next;
    });
  const onRecent = (key: string): void =>
    setRecents((prev) => {
      const next = pushRecent(prev, key);
      save('cac:recents', next);
      return next;
    });

  // Full catalog (always) for favorites + the domain sections; a separate ranked query
  // (keyword/alias-aware, Day 81) drives the flat search results.
  const { data, isLoading } = useCatalogSearch('');
  const searching = q.trim().length > 0;
  const searchResults = useCatalogSearch(q);
  const flatResults = useMemo(
    () => [...SYNTHETIC_CONTAINERS.filter((s) => matchesQuery(s, q)), ...(searching ? (searchResults.data ?? []) : [])],
    [q, searching, searchResults.data],
  );
  const all = useMemo(() => [...SYNTHETIC_CONTAINERS, ...(data ?? [])], [data]);
  const byKey = useMemo(() => new Map(all.map((s) => [s.key, s])), [all]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const pinned = useMemo(() => {
    const fav = favorites.map((k) => byKey.get(k)).filter((s): s is ServiceSummary => Boolean(s));
    const recent = recents.filter((k) => !favSet.has(k)).map((k) => byKey.get(k)).filter((s): s is ServiceSummary => Boolean(s));
    return [...fav, ...recent];
  }, [favorites, recents, byKey, favSet]);

  const byDomain = useMemo(() => {
    const map = new Map<Domain, ServiceSummary[]>();
    for (const s of all) {
      if (!matchesQuery(s, q)) continue;
      const d = domainOf(s);
      const list = map.get(d);
      if (list) list.push(s);
      else map.set(d, [s]);
    }
    return map;
  }, [all, q]);
  const tileProps = { density, onToggleFavorite: toggleFavorite, onRecent };

  return (
    <aside style={{ width: 264, flexShrink: 0, borderRight: '1px solid #e2e8f0', padding: 12, overflowY: 'auto', fontFamily: 'system-ui, sans-serif' }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search services…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', marginBottom: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
      />
      <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
        {DENSITIES.map((d) => (
          <button
            key={d}
            onClick={() => setDensityPersist(d)}
            title={`${d} density`}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: 10.5,
              textTransform: 'capitalize',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: density === d ? '#eff6ff' : '#fff',
              color: density === d ? '#2563eb' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {isLoading ? <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p> : null}

      {searching ? (
        <div>
          {flatResults.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>No services match “{q.trim()}”.</p>
          ) : (
            flatResults.map((s) => (
              <PaletteTile key={s.key} service={s} favorited={favSet.has(s.key)} query={q} tag={domainOf(s)} {...tileProps} />
            ))
          )}
        </div>
      ) : null}

      {!searching && onInsertTemplate ? (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 2px', fontSize: 11, fontWeight: 700, letterSpacing: 0.2, color: '#64748b' }}
          >
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{templatesOpen ? '▾' : '▸'}</span>
            <span style={{ flex: 1 }}>◳ TEMPLATES</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>{TEMPLATES.length}</span>
          </button>
          {templatesOpen ? (
            <div>
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onInsertTemplate(t)}
                  title={`Insert “${t.label}” into the canvas — ${t.description}`}
                  style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 8 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(148,163,184,0.12)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: NEUTRAL.text }}>{t.label}</div>
                  <div style={{ fontSize: 10.5, color: NEUTRAL.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                </button>
              ))}
            </div>
          ) : null}
          <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '8px 0 2px' }} />
        </div>
      ) : null}

      {!searching && pinned.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 2px', fontSize: 11, fontWeight: 700, letterSpacing: 0.2, color: '#64748b' }}>
            <span style={{ color: '#f59e0b' }}>★</span>
            <span style={{ flex: 1 }}>FAVORITES</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>{pinned.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {pinned.map((s) => (
              <PaletteTile key={s.key} service={s} density="compact" favorited={favSet.has(s.key)} onToggleFavorite={toggleFavorite} onRecent={onRecent} />
            ))}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '8px 0 2px' }} />
        </div>
      ) : null}

      {!searching && DOMAIN_ORDER.map((domain) => {
        const items = byDomain.get(domain);
        if (!items || items.length === 0) return null; // hide empty domains
        const isOpen = !collapsed.has(domain);
        return (
          <div key={domain} style={{ marginBottom: 6 }}>
            <button
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(domain)) next.delete(domain);
                  else next.add(domain);
                  return next;
                })
              }
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 2px', fontSize: 11, fontWeight: 700, letterSpacing: 0.2, color: '#64748b' }}
            >
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{DOMAIN_LABEL[domain]}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>{items.length}</span>
            </button>
            {isOpen ? (
              <div>
                {items.map((s) => (
                  <PaletteTile key={s.key} service={s} favorited={favSet.has(s.key)} {...tileProps} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}
