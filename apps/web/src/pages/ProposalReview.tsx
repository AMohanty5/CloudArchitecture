import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Canvas } from '../canvas/Canvas';
import { apiBase } from '../lib/client';
import type { ProjectableModel } from '../canvas/projector';
import type { DiffStatus } from '../canvas/diffView';

/**
 * AI proposal review (blueprint doc 07 / Day 35): the generated model is shown as an
 * all-"added" diff (nothing is merged yet). Accept commits it through the write path;
 * reject discards the ai/gen-* lineage. "Everything is a proposal on a branch."
 */
interface Proposal {
  model: ProjectableModel;
  remaining: number;
}

/** Every element of a fresh generation is new → render the whole model as added (green). */
function allAdded(model: ProjectableModel): Record<string, DiffStatus> {
  const status: Record<string, DiffStatus> = {};
  for (const c of model.components ?? []) status[c.id] = 'added';
  for (const g of model.groups ?? []) status[g.id] = 'added';
  for (const c of model.connections ?? []) status[c.id] = 'added';
  return status;
}

export function ProposalReview() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<Proposal | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await fetch(`${apiBase}/ai/jobs/${jobId}/proposal`);
      if (!active) return;
      if (!res.ok) {
        setError('This proposal is no longer available (expired or already decided).');
        return;
      }
      setProposal((await res.json()) as Proposal);
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  const accept = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/ai/jobs/${jobId}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      });
      if (!res.ok) throw new Error('accept failed');
      const { architectureId } = (await res.json()) as { architectureId: string };
      navigate(`/architectures/${architectureId}`);
    } catch {
      setError('Could not commit the proposal.');
      setBusy(false);
    }
  }, [jobId, navigate]);

  const reject = useCallback(async () => {
    setBusy(true);
    await fetch(`${apiBase}/ai/jobs/${jobId}/reject`, { method: 'POST' });
    navigate('/');
  }, [jobId, navigate]);

  const model = proposal?.model;
  const status = model ? allAdded(model) : {};
  const componentCount = model?.components?.length ?? 0;
  const connectionCount = model?.connections?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Architectures
        </Link>
        <strong>✨ AI proposal</strong>
        {model ? (
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {componentCount} components · {connectionCount} connections
            {proposal && proposal.remaining > 0 ? ` · ${proposal.remaining} finding(s) remaining` : ' · clean'}
          </span>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => void reject()}
            disabled={busy || !model}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#dc2626', fontSize: 14, cursor: busy || !model ? 'default' : 'pointer' }}
          >
            Reject
          </button>
          <button
            onClick={() => void accept()}
            disabled={busy || !model}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: busy || !model ? '#cbd5e1' : '#16a34a', color: '#fff', fontSize: 14, cursor: busy || !model ? 'default' : 'pointer' }}
          >
            {busy ? 'Merging…' : 'Accept & merge'}
          </button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {error ? (
          <p style={{ padding: '2rem', color: '#dc2626' }}>{error}</p>
        ) : model ? (
          <Canvas model={model} layout={{}} diffStatus={status} title={(model as { name?: string }).name ?? 'AI proposal'} subtitle="✨ Generated proposal" />
        ) : (
          <p style={{ padding: '2rem', color: '#64748b' }}>Loading proposal…</p>
        )}
      </div>
    </div>
  );
}
