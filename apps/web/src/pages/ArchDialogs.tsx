import { useState } from 'react';

/** Shared modal shell (centered, dimmed backdrop, Esc/backdrop to dismiss). */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'grid', placeItems: 'center', zIndex: 50, fontFamily: 'system-ui, sans-serif' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 92vw)', background: '#fff', borderRadius: 12, boxShadow: '0 16px 48px rgba(15,23,42,0.25)', padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{title}</div>
        {children}
      </div>
      <button aria-label="Close" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }} />
    </div>
  );
}

const btn = (primary: boolean, danger = false): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: primary ? 'none' : '1px solid #cbd5e1',
  background: primary ? (danger ? '#dc2626' : '#2563eb') : '#fff',
  color: primary ? '#fff' : '#334155',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
});

/** Text-input dialog for Rename / Duplicate. */
export function TextPromptDialog({
  title,
  label,
  initial,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  busy: boolean;
  error?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    if (value.trim() && !busy) onConfirm(value.trim());
  };
  return (
    <Modal title={title} onClose={onCancel}>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</label>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
      />
      {error ? <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{error}</div> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
        <button onClick={submit} disabled={!value.trim() || busy} style={{ ...btn(true), opacity: !value.trim() || busy ? 0.6 : 1 }}>
          {busy ? '…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Confirmation dialog for bulk Delete (echoes the count to prevent accidents). */
export function ConfirmBulkDeleteDialog({
  count,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  count: number;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={`Delete ${count} architecture${count === 1 ? '' : 's'}?`} onClose={onCancel}>
      <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
        This permanently deletes <strong>{count}</strong> selected architecture{count === 1 ? '' : 's'} and their entire
        version history. This cannot be undone.
      </div>
      {error ? <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{error}</div> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
        <button onClick={onConfirm} disabled={busy} style={{ ...btn(true, true), opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Deleting…' : `Delete ${count}`}
        </button>
      </div>
    </Modal>
  );
}

/** Confirmation dialog for Delete (echoes the name to prevent accidents). */
export function ConfirmDeleteDialog({
  name,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="Delete architecture?" onClose={onCancel}>
      <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
        This permanently deletes <strong>{name}</strong> and its entire version history. This cannot be undone.
      </div>
      {error ? <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{error}</div> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
        <button onClick={onConfirm} disabled={busy} style={{ ...btn(true, true), opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}
