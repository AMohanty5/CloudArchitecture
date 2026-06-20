import { useState } from 'react';
import { useCatalogSearch } from '../lib/queries';
import type { ServiceSummary } from '../lib/queries';
import { SERVICE_DRAG_MIME } from './commands';

function categoryOf(s: ServiceSummary): string {
  return s.abstractTypes?.[0]?.split('.')[0] ?? (s.groupKind ? 'network (group)' : 'other');
}

function groupByCategory(items: ServiceSummary[]): Array<[string, ServiceSummary[]]> {
  const map = new Map<string, ServiceSummary[]>();
  for (const s of items) {
    const cat = categoryOf(s);
    const list = map.get(cat);
    if (list) list.push(s);
    else map.set(cat, [s]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function PaletteItem({ service }: { service: ServiceSummary }): React.JSX.Element {
  const isGroup = Boolean(service.groupKind);
  const draggable = (service.abstractTypes?.length ?? 0) > 0 || isGroup;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(service));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={isGroup ? 'Drag onto the canvas — drop onto a container to nest' : 'Drag onto the canvas'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 9px',
        marginBottom: 6,
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
        cursor: draggable ? 'grab' : 'not-allowed',
        opacity: draggable ? 1 : 0.5,
      }}
    >
      <img src={service.iconUrl} width={28} height={28} alt="" style={{ borderRadius: 7, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {service.name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{service.key}</div>
      </div>
    </div>
  );
}

/** Catalog palette: search, grouped by abstract type, drag source (doc 06). */
export function Palette(): React.JSX.Element {
  const [q, setQ] = useState('');
  const { data, isLoading } = useCatalogSearch(q);
  const groups = groupByCategory(data ?? []);
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid #e2e8f0',
        padding: 12,
        overflowY: 'auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search services…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', marginBottom: 10, borderRadius: 6, border: '1px solid #cbd5e1' }}
      />
      {isLoading ? <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p> : null}
      {groups.map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', margin: '6px 0' }}>{cat}</div>
          {items.map((s) => (
            <PaletteItem key={s.key} service={s} />
          ))}
        </div>
      ))}
    </aside>
  );
}
