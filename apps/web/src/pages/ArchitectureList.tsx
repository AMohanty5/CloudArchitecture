import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createArchitecture, createArchitectureFromTemplate, useArchitectures } from '../lib/queries';
import { TEMPLATES } from '../canvas/templates';
import { AiConsole } from './AiConsole';

export function ArchitectureList() {
  const { data, isLoading, isError } = useArchitectures();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);

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

  const onUseTemplate = async (key: string): Promise<void> => {
    if (seeding) return;
    const tmpl = TEMPLATES.find((t) => t.key === key);
    if (!tmpl) return;
    setSeeding(key);
    try {
      const { id } = await createArchitectureFromTemplate(tmpl.defaultName, tmpl.model);
      await queryClient.invalidateQueries({ queryKey: ['architectures'] });
      navigate(`/architectures/${id}`);
    } catch {
      setSeeding(null);
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <h1>Architectures</h1>

      <AiConsole />

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

      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', fontWeight: 700, margin: '0 0 8px' }}>
        Start from a template
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: '1.75rem' }}>
        {TEMPLATES.map((t) => {
          const busy = seeding === t.key;
          return (
            <button
              key={t.key}
              onClick={() => void onUseTemplate(t.key)}
              disabled={Boolean(seeding)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: busy ? '#f1f5f9' : '#fff',
                boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                cursor: seeding ? 'default' : 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{busy ? 'Creating…' : t.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>{t.description}</div>
            </button>
          );
        })}
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
