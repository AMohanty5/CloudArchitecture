import { useCallback, useRef, useState } from 'react';
import { apiBase } from '../lib/client';

/**
 * AI generation console (blueprint doc 07 / Day 30). Posts a prompt to /ai/generate, then
 * streams the pipeline's stage + token-accounting events over SSE into a live log.
 * Generation is stubbed server-side for now — this proves the streaming path end-to-end.
 */

interface StageEvent {
  type: 'stage';
  stage: string;
  status: 'started' | 'completed';
  model?: string;
  detail?: string;
}
interface UsageEvent {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}
interface DoneEvent {
  type: 'done';
  branch: string;
  message: string;
  architectureId?: string;
}
type AiEvent = StageEvent | UsageEvent | DoneEvent | { type: 'error'; message: string };

interface LogLine {
  text: string;
  tone: 'stage' | 'detail' | 'usage' | 'done' | 'error';
  href?: string;
}

const TONE_COLOR: Record<LogLine['tone'], string> = {
  stage: '#1e293b',
  detail: '#64748b',
  usage: '#0f766e',
  done: '#16a34a',
  error: '#dc2626',
};

export function AiConsole() {
  const [prompt, setPrompt] = useState('A highly available 3-tier e-commerce platform on AWS');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  const append = useCallback((line: LogLine) => setLog((prev) => [...prev, line]), []);

  const onGenerate = useCallback(async () => {
    if (running || !prompt.trim()) return;
    setLog([]);
    setRunning(true);
    sourceRef.current?.close();
    try {
      const res = await fetch(`${apiBase}/ai/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const { jobId } = (await res.json()) as { jobId: string };

      const source = new EventSource(`${apiBase}/ai/jobs/${jobId}/stream`);
      sourceRef.current = source;
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as AiEvent;
        if (event.type === 'stage' && event.status === 'started') {
          append({ text: `▶ ${event.stage}${event.model ? ` · ${event.model}` : ''}`, tone: 'stage' });
        } else if (event.type === 'stage' && event.status === 'completed') {
          if (event.detail) append({ text: `   ${event.detail}`, tone: 'detail' });
        } else if (event.type === 'usage') {
          append({
            text: `Σ ${event.inputTokens.toLocaleString()} in / ${event.outputTokens.toLocaleString()} out · ~$${event.estCostUsd.toFixed(2)}`,
            tone: 'usage',
          });
        } else if (event.type === 'done') {
          append({ text: `✓ ${event.message} (${event.branch})`, tone: 'done' });
          if (event.architectureId) append({ text: '→ open generated architecture', tone: 'done', href: `/architectures/${event.architectureId}` });
          source.close();
          setRunning(false);
        } else if (event.type === 'error') {
          append({ text: `✗ ${event.message}`, tone: 'error' });
          source.close();
          setRunning(false);
        }
      };
      source.onerror = () => {
        source.close();
        setRunning(false);
      };
    } catch {
      append({ text: '✗ failed to start generation', tone: 'error' });
      setRunning(false);
    }
  }, [prompt, running, append]);

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 24, background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>✨ Generate with AI</strong>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>preview · pipeline stubbed</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onGenerate();
          }}
          aria-label="Generation prompt"
          placeholder="Describe the architecture…"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <button
          onClick={() => void onGenerate()}
          disabled={running || !prompt.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: running || !prompt.trim() ? '#cbd5e1' : '#7c3aed',
            color: '#fff',
            fontSize: 14,
            cursor: running || !prompt.trim() ? 'default' : 'pointer',
          }}
        >
          {running ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {log.length > 0 ? (
        <pre
          style={{
            marginTop: 12,
            marginBottom: 0,
            padding: 12,
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 240,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {log.map((line, i) => (
            <div key={i} style={{ color: TONE_COLOR[line.tone] === '#1e293b' ? '#e2e8f0' : TONE_COLOR[line.tone] }}>
              {line.href ? (
                <a href={line.href} style={{ color: '#60a5fa' }}>
                  {line.text}
                </a>
              ) : (
                line.text
              )}
            </div>
          ))}
        </pre>
      ) : null}
    </section>
  );
}
