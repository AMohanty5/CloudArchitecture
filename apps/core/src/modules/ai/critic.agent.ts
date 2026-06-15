import type Anthropic from '@anthropic-ai/sdk';
import type { CamlDocument, Requirement } from '@cac/caml';
import { validateModel } from '../validation/api';
import type { AnthropicLike } from './requirements.agent';

/**
 * Critic (blueprint doc 07 / doc 17 `critic/v1`, frontier tier). An adversarial principal
 * architect reviewing a candidate model BEFORE the user sees it. It calls `run_validation`
 * — the deterministic Day-25 engine, ground truth — then merges those findings with its own
 * requirements audit + adversarial pass. It never mutates the model; it emits findings for
 * the Repair agent. Doc 07 invariant: deterministic engines decide, AI explains.
 */

export interface CriticFinding {
  severity: string;
  componentRefs: string[];
  problem: string;
  whyItMatters: string;
  fixInstruction: string;
}
export interface CriticResult {
  verdict: 'pass' | 'revise';
  findings: CriticFinding[];
  usage: { inputTokens: number; outputTokens: number };
}

const RUN_VALIDATION_TOOL: Anthropic.Tool = {
  name: 'run_validation',
  description:
    'Run the deterministic Validation Engine on the model under review. Returns findings with rule IDs and severities. This is ground truth — include every critical/high finding and never contradict it.',
  input_schema: { type: 'object', properties: {} },
};

const CONTRACT_HINT = `{
  "verdict": "pass" | "revise",
  "findings": [{ "severity": "critical"|"high"|"medium"|"low", "component_refs": [component id], "problem": string, "why_it_matters": string, "fix_instruction": string }]
}`;

export async function runCritic(
  input: { target: CamlDocument; requirements: Requirement[] },
  deps: { client: AnthropicLike; model: string; system: string; maxIterations?: number; maxTokens?: number },
): Promise<CriticResult> {
  const reqs = input.requirements.map((r) => ({ id: r.id, kind: r.kind, statement: r.statement }));
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Candidate model:\n${JSON.stringify(input.target)}\n\nRequirements:\n${JSON.stringify(reqs)}\n\n` +
        `Call run_validation first, then return ONLY the review JSON — no prose, no fences:\n${CONTRACT_HINT}`,
    },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  const maxIters = deps.maxIterations ?? 4;
  for (let i = 0; i < maxIters; i++) {
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: deps.maxTokens ?? 4000,
      thinking: { type: 'adaptive' },
      system: deps.system,
      tools: [RUN_VALIDATION_TOOL],
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    if (res.stop_reason === 'refusal') throw new Error('critic: the model refused the request');
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length > 0) {
      // run_validation always validates the model under review (deterministic ground truth).
      const report = validateModel(input.target);
      messages.push({
        role: 'user',
        content: toolUses.map((tu) => ({ type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(report) })),
      });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { ...parseReview(text), usage: { inputTokens, outputTokens } };
  }
  throw new Error('critic: did not converge to a verdict');
}

function parseReview(text: string): Omit<CriticResult, 'usage'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('critic: no JSON object in model output');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('critic: model output was not valid JSON');
  }
  const o = raw as Record<string, unknown>;
  const findings: CriticFinding[] = (Array.isArray(o.findings) ? o.findings : [])
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f) => ({
      severity: String(f.severity ?? 'medium'),
      componentRefs: Array.isArray(f.component_refs) ? f.component_refs.map(String) : [],
      problem: String(f.problem ?? ''),
      whyItMatters: String(f.why_it_matters ?? ''),
      fixInstruction: String(f.fix_instruction ?? ''),
    }))
    .filter((f) => f.problem.length > 0);
  const verdict = o.verdict === 'pass' && findings.length === 0 ? 'pass' : findings.length === 0 ? 'pass' : 'revise';
  return { verdict, findings };
}
