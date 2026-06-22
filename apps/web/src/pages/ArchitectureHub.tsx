import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createArchitecture, createArchitectureFromTemplate, useArchitectures } from '../lib/queries';
import type { ArchitectureSummary } from '../lib/queries';
import { deleteArchitecture, duplicateArchitecture, renameArchitecture, setArchitectureLifecycle } from '../lib/archActions';
import { TEMPLATES } from '../canvas/templates';
import { AiConsole } from './AiConsole';
import { ArchitectureCard, type CardAction } from './ArchitectureCard';
import { ConfirmDeleteDialog, TextPromptDialog } from './ArchDialogs';
import {
  deriveMetrics,
  filterSortArchitectures,
  lifecycleMeta,
  useArchPrefs,
  type HubFilter,
  type SortKey,
} from '../lib/useArchHub';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'modified-desc', label: 'Last modified' },
  { value: 'created-desc', label: 'Newest' },
  { value: 'created-asc', label: 'Oldest' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
];

type Dialog =
  | { kind: 'rename'; arch: ArchitectureSummary }
  | { kind: 'duplicate'; arch: ArchitectureSummary }
  | { kind: 'delete'; arch: ArchitectureSummary }
  | null;

const selectStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', color: '#334155' };

export function ArchitectureHub() {
  const { data, isLoading, isError } = useArchitectures();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { favorites, toggleFavorite, recents, recordOpen } = useArchPrefs();

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);
  const [filter, setFilter] = useState<HubFilter>({ query: '', status: 'all', favoritesOnly: false });
  const [sort, setSort] = useState<SortKey>('modified-desc');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['architectures'] });

  const handleAction = (action: CardAction, arch: ArchitectureSummary): void => {
    setDialogError(undefined);
    if (action === 'archive') {
      void (async () => {
        try {
          await setArchitectureLifecycle(arch.id, 'archived');
          await refresh();
        } catch {
          /* surfaced on next load */
        }
      })();
      return;
    }
    setDialog({ kind: action, arch });
  };

  const runDialog = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setDialogError(undefined);
    try {
      await fn();
      await refresh();
      setDialog(null);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const all = data ?? [];
  const metrics = useMemo(() => deriveMetrics(all), [all]);
  const visible = useMemo(() => filterSortArchitectures(all, filter, sort, favorites), [all, filter, sort, favorites]);
  const recentItems = useMemo(() => recents.map((id) => all.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a)).slice(0, 6), [recents, all]);
  const statuses = useMemo(() => Object.keys(metrics.byStatus).sort(), [metrics]);

  const onCreate = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const { id } = await createArchitecture(trimmed);
      await queryClient.invalidateQueries({ queryKey: ['architectures'] });
      recordOpen(id);
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
      recordOpen(id);
      navigate(`/architectures/${id}`);
    } catch {
      setSeeding(null);
    }
  };

  const filtering = filter.query !== '' || filter.status !== 'all' || filter.favoritesOnly;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.75rem 2rem', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 14px' }}>Architectures</h1>

      {/* Metrics strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <Metric label="Total" value={metrics.total} />
        {['draft', 'in_review', 'approved', 'published', 'archived', 'template'].map((s) =>
          metrics.byStatus[s] ? <Metric key={s} label={lifecycleMeta(s).label} value={metrics.byStatus[s]!} dot={lifecycleMeta(s).color} /> : null,
        )}
        <Metric label="Templates available" value={TEMPLATES.length} />
      </div>

      {/* AI + create */}
      <AiConsole />
      <div style={{ display: 'flex', gap: 8, margin: '1rem 0 1.5rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void onCreate(); }}
          placeholder="New architecture name…"
          aria-label="New architecture name"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <button
          onClick={() => void onCreate()}
          disabled={!name.trim() || creating}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: !name.trim() || creating ? '#cbd5e1' : '#2563eb', color: '#fff', fontSize: 14, cursor: !name.trim() || creating ? 'default' : 'pointer' }}
        >
          {creating ? 'Creating…' : 'New architecture'}
        </button>
      </div>

      {/* Templates */}
      <SectionLabel>Start from a template</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: '1.75rem' }}>
        {TEMPLATES.map((t) => {
          const busy = seeding === t.key;
          return (
            <button key={t.key} onClick={() => void onUseTemplate(t.key)} disabled={Boolean(seeding)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: busy ? '#f1f5f9' : '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.05)', cursor: seeding ? 'default' : 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{busy ? 'Creating…' : t.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>{t.description}</div>
            </button>
          );
        })}
      </div>

      {/* Recent rail */}
      {!filtering && recentItems.length > 0 ? (
        <>
          <SectionLabel>🕘 Recent</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {recentItems.map((a) => (
              <button key={a.id} onClick={() => { recordOpen(a.id); navigate(`/architectures/${a.id}`); }} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                {a.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <input
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          placeholder="Search architectures…"
          aria-label="Search architectures"
          style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5 }}
        />
        <select aria-label="Filter by status" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} style={selectStyle}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{lifecycleMeta(s).label} ({metrics.byStatus[s]})</option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={selectStyle}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button
          onClick={() => setFilter((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
          aria-pressed={filter.favoritesOnly}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: filter.favoritesOnly ? '#fffbeb' : '#fff', color: filter.favoritesOnly ? '#b45309' : '#334155', fontSize: 13, cursor: 'pointer' }}
        >
          {filter.favoritesOnly ? '★ Favorites' : '☆ Favorites'}
        </button>
      </div>

      {/* Grid / states */}
      {isLoading ? <p style={{ color: '#64748b' }}>Loading…</p> : null}
      {isError ? <p style={{ color: '#dc2626' }}>Failed to load architectures.</p> : null}

      {!isLoading && all.length === 0 ? (
        <EmptyState onFocusCreate={() => document.querySelector<HTMLInputElement>('input[aria-label="New architecture name"]')?.focus()} />
      ) : visible.length === 0 ? (
        <p style={{ color: '#94a3b8', padding: '24px 0', textAlign: 'center' }}>No architectures match your filters.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visible.map((a) => (
            <ArchitectureCard key={a.id} arch={a} isFavorite={favorites.has(a.id)} onToggleFavorite={toggleFavorite} onOpen={recordOpen} onAction={handleAction} />
          ))}
        </div>
      )}

      {dialog?.kind === 'rename' ? (
        <TextPromptDialog
          title="Rename architecture"
          label="Name"
          initial={dialog.arch.name}
          confirmLabel="Rename"
          busy={busy}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onConfirm={(name) => void runDialog(() => renameArchitecture(dialog.arch.id, name).then(() => undefined))}
        />
      ) : null}
      {dialog?.kind === 'duplicate' ? (
        <TextPromptDialog
          title="Duplicate architecture"
          label="Name for the copy"
          initial={`Copy of ${dialog.arch.name}`}
          confirmLabel="Duplicate"
          busy={busy}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onConfirm={(name) =>
            void runDialog(async () => {
              const res = await duplicateArchitecture(dialog.arch.id, name);
              if (res?.id) {
                recordOpen(res.id);
                navigate(`/architectures/${res.id}`);
              }
            })
          }
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDeleteDialog
          name={dialog.arch.name}
          busy={busy}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onConfirm={() => void runDialog(() => deleteArchitecture(dialog.arch.id).then(() => undefined))}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff' }}>
      {dot ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} /> : null}
      <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{value}</span>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', fontWeight: 700, margin: '0 0 8px' }}>{children}</div>;
}

function EmptyState({ onFocusCreate }: { onFocusCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px', border: '1px dashed #cbd5e1', borderRadius: 14, background: '#f8fafc' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Create your first architecture</div>
      <div style={{ fontSize: 13.5, color: '#64748b', margin: '6px 0 16px' }}>Generate one with AI, start from a template, or create a blank canvas.</div>
      <button onClick={onFocusCreate} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        + New architecture
      </button>
    </div>
  );
}
