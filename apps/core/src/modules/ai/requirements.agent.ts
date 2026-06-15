import type Anthropic from '@anthropic-ai/sdk';
import type { Requirement } from '@cac/caml';

/**
 * Requirements agent (blueprint doc 07 / doc 17 `requirements/v1`). Turns a user's
 * request into structured CAML requirements + ambiguities, making implicit needs explicit
 * (each inference labelled `source: inferred` with a confidence). The first real model
 * call in the pipeline — mid tier (Sonnet) per doc 07. The client is injected so the agent
 * is unit-testable with a mock and eval-testable against the live model.
 *
 * Output is parsed from a JSON contract rather than structured-output constraints: the
 * `quantity` field is an open key-value map, which JSON-Schema strict mode can't express.
 */

export interface Ambiguity {
  id: string;
  question: string;
  kind: 'blocking' | 'non_blocking';
  defaultAssumption?: string;
}

export interface RequirementsResult {
  requirements: Requirement[];
  ambiguities: Ambiguity[];
  workloadClass: string;
  flags: string[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Minimal shape of the Anthropic client the agent needs (real client satisfies it; tests mock it). */
export interface AnthropicLike {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

const VALID_KINDS = new Set<Requirement['kind']>([
  'availability', 'scalability', 'latency', 'throughput', 'durability', 'security',
  'compliance', 'budget', 'rpo_rto', 'data_residency', 'operability', 'other',
]);

const CONTRACT_HINT = `{
  "requirements": [{ "id": string, "kind": one of [availability, scalability, latency, throughput, durability, security, compliance, budget, rpo_rto, data_residency, operability, other], "statement": string, "quantity"?: object of machine-checkable params, "source"?: "user" | "inferred", "confidence"?: number 0..1, "priority"?: "must" | "should" | "could" }],
  "ambiguities": [{ "id": string, "question": string, "kind": "blocking" | "non_blocking", "default_assumption"?: string }],
  "workload_class": string,
  "flags": [string]
}`;

export async function runRequirements(
  input: { prompt: string },
  deps: { client: AnthropicLike; model: string; system: string; maxTokens?: number },
): Promise<RequirementsResult> {
  const res = await deps.client.messages.create({
    model: deps.model,
    max_tokens: deps.maxTokens ?? 4000,
    thinking: { type: 'adaptive' },
    system: `${deps.system}\n\nReturn ONLY a single JSON object in this exact shape — no prose, no markdown fences:\n${CONTRACT_HINT}`,
    messages: [{ role: 'user', content: `<request>\n${input.prompt}\n</request>` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('requirements: the model refused the request');
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const parsed = parseContract(text);
  return { ...parsed, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
}

/** Parse the JSON contract out of the model's text (tolerant of stray prose / fences). */
function parseContract(text: string): Omit<RequirementsResult, 'usage'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('requirements: no JSON object in model output');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('requirements: model output was not valid JSON');
  }
  const o = raw as Record<string, unknown>;

  const requirements = (Array.isArray(o.requirements) ? o.requirements : [])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map(normalizeReq)
    .filter((r) => r.statement.length > 0);

  const ambiguities: Ambiguity[] = (Array.isArray(o.ambiguities) ? o.ambiguities : [])
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a, i) => ({
      id: String(a.id ?? `amb-${i + 1}`),
      question: String(a.question ?? ''),
      kind: a.kind === 'blocking' ? ('blocking' as const) : ('non_blocking' as const),
      defaultAssumption: a.default_assumption !== undefined ? String(a.default_assumption) : undefined,
    }))
    .filter((a) => a.question.length > 0);

  return {
    requirements,
    ambiguities,
    workloadClass: typeof o.workload_class === 'string' ? o.workload_class : 'unknown',
    flags: Array.isArray(o.flags) ? o.flags.map(String) : [],
  };
}

function normalizeReq(r: Record<string, unknown>, i: number): Requirement {
  const kind = VALID_KINDS.has(r.kind as Requirement['kind']) ? (r.kind as Requirement['kind']) : 'other';
  const req: Requirement = { id: String(r.id ?? `req-${i + 1}`), kind, statement: String(r.statement ?? '') };
  if (r.quantity && typeof r.quantity === 'object' && !Array.isArray(r.quantity)) {
    req.quantity = r.quantity as Requirement['quantity'];
  }
  if (r.source === 'inferred' || r.source === 'user') req.source = r.source;
  if (typeof r.confidence === 'number') req.confidence = r.confidence;
  if (r.priority === 'must' || r.priority === 'should' || r.priority === 'could') req.priority = r.priority;
  return req;
}
