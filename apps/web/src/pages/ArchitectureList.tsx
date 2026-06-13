import { Link } from 'react-router-dom';
import { useArchitectures } from '../lib/queries';

export function ArchitectureList() {
  const { data, isLoading, isError } = useArchitectures();
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <h1>Architectures</h1>
      {isLoading ? <p style={{ color: '#64748b' }}>Loading…</p> : null}
      {isError ? <p style={{ color: '#dc2626' }}>Failed to load architectures.</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(data ?? []).map((a) => (
          <li key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
            <Link to={`/architectures/${a.id}`} style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              {a.name}
            </Link>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>{a.lifecycle}</span>
            {a.description ? <div style={{ marginTop: 2, fontSize: 13, color: '#64748b' }}>{a.description}</div> : null}
          </li>
        ))}
      </ul>
      {data && data.length === 0 && !isLoading ? <p style={{ color: '#64748b' }}>No architectures yet.</p> : null}
    </main>
  );
}
