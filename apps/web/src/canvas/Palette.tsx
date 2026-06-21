import { useMemo, useState } from 'react';
import { useCatalogSearch } from '../lib/queries';
import type { ServiceSummary } from '../lib/queries';
import { SERVICE_DRAG_MIME } from './commands';
import { domainOf, shortName, DOMAIN_ORDER, DOMAIN_LABEL } from './domains';
import type { Domain } from './domains';
import { NEUTRAL } from './theme';

/**
 * Architecture-first sidebar (Day 79, docs/sidebar-redesign.md). Services are grouped into
 * collapsible domain sections (containers / edge / compute / …), shown as compact draggable
 * tiles with a Compact / Comfortable / Detailed density toggle. Empty domains are hidden.
 */

type Density = 'compact' | 'comfortable' | 'detailed';
const DENSITY_HEIGHT: Record<Density, number> = { compact: 30, comfortable: 46, detailed: 60 };

/** Architecture containers with no catalog service (Region + AZ); dropping one creates a group. */
const SYNTHETIC_CONTAINERS: ServiceSummary[] = [
  { key: '_region', name: 'AWS Region', provider: 'aws', groupKind: 'region', status: 'ga', iconUrl: '/api/v1/catalog/icons/_region', score: 0 },
  { key: '_az', name: 'Availability Zone', provider: 'aws', groupKind: 'zone', status: 'ga', iconUrl: '/api/v1/catalog/icons/_az', score: 0 },
];
function matchesQuery(s: ServiceSummary, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || s.name.toLowerCase().includes(t) || s.key.includes(t) || (s.groupKind ?? '').includes(t);
}

function PaletteTile({ service, density }: { service: ServiceSummary; density: Density }): React.JSX.Element {
  const isGroup = Boolean(service.groupKind);
  const draggable = (service.abstractTypes?.length ?? 0) > 0 || isGroup;
  const icon = density === 'compact' ? 18 : 20;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(service));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={isGroup ? 'Drag onto the canvas — drop onto a container to nest' : `${service.name} · ${service.key}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: DENSITY_HEIGHT[density],
        padding: '0 8px',
        borderRadius: 8,
        background: 'transparent',
        cursor: draggable ? 'grab' : 'not-allowed',
        opacity: draggable ? 1 : 0.5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(148,163,184,0.12)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <img src={service.iconUrl} width={icon} height={icon} alt="" style={{ borderRadius: 5, flexShrink: 0 }} />
      <div style={{ minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NEUTRAL.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {shortName(service.name)}
        </div>
        {density !== 'compact' ? (
          <div style={{ fontSize: 11, color: NEUTRAL.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{service.name}</div>
        ) : null}
        {density === 'detailed' ? <div style={{ fontSize: 10, color: '#cbd5e1' }}>{service.key}</div> : null}
      </div>
    </div>
  );
}

const DENSITIES: Density[] = ['compact', 'comfortable', 'detailed'];

/** Catalog palette: architecture-first domain sections + density modes (doc: sidebar-redesign). */
export function Palette(): React.JSX.Element {
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
  const { data, isLoading } = useCatalogSearch(q);

  const byDomain = useMemo(() => {
    const items = [...SYNTHETIC_CONTAINERS.filter((s) => matchesQuery(s, q)), ...(data ?? [])];
    const map = new Map<Domain, ServiceSummary[]>();
    for (const s of items) {
      const d = domainOf(s);
      const list = map.get(d);
      if (list) list.push(s);
      else map.set(d, [s]);
    }
    return map;
  }, [data, q]);

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

      {DOMAIN_ORDER.map((domain) => {
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
                  <PaletteTile key={s.key} service={s} density={density} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}
