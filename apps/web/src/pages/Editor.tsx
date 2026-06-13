import { Link, useParams } from 'react-router-dom';
import { useModel } from '../lib/queries';
import { Canvas } from '../canvas/Canvas';
import type { ProjectableModel } from '../canvas/projector';

export function Editor() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useModel(id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e2e8f0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Architectures
        </Link>
        <strong>Editor</strong>
        {isLoading ? <span style={{ color: '#94a3b8' }}>loading…</span> : null}
        {isError ? <span style={{ color: '#dc2626' }}>failed to load</span> : null}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{data ? <Canvas model={data as ProjectableModel} /> : null}</div>
    </div>
  );
}
