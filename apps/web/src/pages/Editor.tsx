import { Link, useParams } from 'react-router-dom';
import { Canvas } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { useEditor } from '../lib/useEditor';
import type { SaveState } from '../lib/useEditor';
import type { ProjectableModel } from '../canvas/projector';

const SAVE_BADGE: Record<SaveState, { label: string; color: string }> = {
  loading: { label: 'Loading…', color: '#94a3b8' },
  saving: { label: '● Saving…', color: '#d97706' },
  saved: { label: '● Saved', color: '#16a34a' },
  conflict: { label: '● Conflict — reloaded from server', color: '#ea580c' },
  error: { label: '● Save failed — reverted', color: '#dc2626' },
};

export function Editor() {
  const { id = '' } = useParams();
  const { model, layout, saveState, addComponent } = useEditor(id);
  const badge = SAVE_BADGE[saveState];

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
        <span style={{ marginLeft: 'auto', fontSize: 13, color: badge.color }}>{badge.label}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette />
        <div style={{ flex: 1, minWidth: 0 }}>
          {model ? (
            <Canvas
              model={model as ProjectableModel}
              layout={{ positions: layout }}
              onDropService={addComponent}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
