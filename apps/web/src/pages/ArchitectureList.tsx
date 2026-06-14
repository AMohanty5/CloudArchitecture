import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createArchitecture, useArchitectures } from '../lib/queries';

export function ArchitectureList() {
  const { data, isLoading, isError } = useArchitectures();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const onCreate = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const { id } = await createArchitecture(trimmed);
      await queryClient.invalidateQueries({ queryKey: ['architectures'] });
      navigate(`/architectures/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <h1>Architectures</h1>

      <div style={{ display: 'flex', gap: 8, margin: '1rem 0 1.5rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onCreate();
          }}
          placeholder="New architecture name…"
          aria-label="New architecture name"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <button
          onClick={() => void onCreate()}
          disabled={!name.trim() || creating}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: !name.trim() || creating ? '#cbd5e1' : '#2563eb',
            color: '#fff',
            fontSize: 14,
            cursor: !name.trim() || creating ? 'default' : 'pointer',
          }}
        >
          {creating ? 'Creating…' : 'New architecture'}
        </button>
      </div>

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
