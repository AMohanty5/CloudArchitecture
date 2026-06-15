import type Anthropic from '@anthropic-ai/sdk';
import type { Requirement } from '@cac/caml';
import type { AnthropicLike } from './requirements.agent';
import { searchPatterns } from './pattern-store';
import type { PatternStore } from './pattern-store';

/**
 * Design Planner (blueprint doc 07 / doc 17 `planner/v1`, frontier tier → Opus). Turns
 * structured requirements into a capability plan — the architecture's skeleton in *abstract
 * types*, with NO service bindings (binding is the Composer's job). It is a tool-using
 * agent: it calls `pattern_fetch` to ground the topology in curated reference patterns,
 * then emits the plan. Manual agentic loop (fine-grained control + token accounting).
 */

export interface CapabilityNeed {
  id: string;
  abstractType: string;
  purpose: string;
  requirementRefs: string[];
  patternRef?: string;
}
export interface PlannerResult {
  groupsPlan: Array<{ id: string; kind: string; purpose?: string }>;
  capabilityNeeds: CapabilityNeed[];
  connectionPlan: Array<{ from: string; to: string; kind: string; purpose?: string }>;
  tradeoffs: Array<{ decision: string; rationale: string; requirementRefs: string[] }>;
  patternCitations: string[];
  usage: { inputTokens: number; outputTokens: number };
}

const PATTERN_FETCH_TOOL: Anthropic.Tool = {
  name: 'pattern_fetch',
  description:
    'Retrieve reference patterns (curated partial CAML — abstract types only, no service bindings) by keyword search. Returns patterns with applicability notes, capabilities, connections, and citations. Call this for each major capability need before composing the plan.',
  input_schema: {
    type: 'object',
    required: ['need'],
    properties: {
      need: { type: 'string', description: 'The capability need to find patterns for.' },
      tags: { type: 'array', items: { type: 'string' } },
      limit: { type: 'integer' },
    },
  },
};

const CONTRACT_HINT = `{
  "groups_plan": [{ "id": string, "kind": "region"|"network"|"subnet"|"tier"|"zone", "purpose"?: string }],
  "capability_needs": [{ "id": string, "abstract_type": CAML abstract type ONLY (e.g. "database.relational" — never a service key like "aws.rds"), "purpose": string, "requirement_refs": [requirement id], "pattern_ref"?: pattern id }],
  "connection_plan": [{ "from": capability id, "to": capability id, "kind": "traffic"|"data"|"async"|"dependency", "purpose"?: string }],
  "tradeoffs": [{ "decision": string, "rationale": string, "requirement_refs": [requirement id] }],
  "pattern_citations": [pattern id you adopted]
}`;

export async function runPlanner(
  input: { requirements: Requirement[]; provider?: string },
  deps: { client: AnthropicLike; model: string; system: string; patterns: PatternStore; maxTokens?: number; maxIterations?: number },
): Promise<PlannerResult> {
  const reqJson = JSON.stringify(
    input.requirements.map((r) => ({ id: r.id, kind: r.kind, statement: r.statement, quantity: r.quantity, priority: r.priority })),
    null,
    2,
  );
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Target provider: ${input.provider ?? 'aws'}\n\nRequirements:\n${reqJson}\n\n` +
        `Use pattern_fetch for each major capability need, then return ONLY the capability plan JSON ` +
        `in this exact shape — no prose, no markdown fences:\n${CONTRACT_HINT}`,
    },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  const maxIters = deps.maxIterations ?? 6;
  for (let i = 0; i < maxIters; i++) {
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: deps.maxTokens ?? 8000,
      thinking: { type: 'adaptive' },
      system: deps.system,
      tools: [PATTERN_FETCH_TOOL],
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    if (res.stop_reason === 'refusal') throw new Error('planner: the model refused the request');
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { ...parsePlan(text), usage: { inputTokens, outputTokens } };
    }

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      const args = (tu.input ?? {}) as { need?: string; tags?: string[]; limit?: number };
      const found = args.need ? searchPatterns(deps.patterns, { need: args.need, tags: args.tags, limit: args.limit }) : [];
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(found) };
    });
    messages.push({ role: 'user', content: results });
  }
  throw new Error('planner: did not converge to a plan within the iteration budget');
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function parsePlan(text: string): Omit<PlannerResult, 'usage'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('planner: no JSON object in model output');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('planner: model output was not valid JSON');
  }
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);

  return {
    groupsPlan: arr(o.groups_plan).map((g) => ({ id: String(g.id ?? ''), kind: String(g.kind ?? 'custom'), purpose: g.purpose ? String(g.purpose) : undefined })),
    capabilityNeeds: arr(o.capability_needs).map((c, i) => ({
      id: String(c.id ?? `cap-${i + 1}`),
      abstractType: String(c.abstract_type ?? ''),
      purpose: String(c.purpose ?? ''),
      requirementRefs: asStringArray(c.requirement_refs),
      patternRef: c.pattern_ref ? String(c.pattern_ref) : undefined,
    })),
    connectionPlan: arr(o.connection_plan).map((c) => ({ from: String(c.from ?? ''), to: String(c.to ?? ''), kind: String(c.kind ?? 'traffic'), purpose: c.purpose ? String(c.purpose) : undefined })),
    tradeoffs: arr(o.tradeoffs).map((t) => ({ decision: String(t.decision ?? ''), rationale: String(t.rationale ?? ''), requirementRefs: asStringArray(t.requirement_refs) })),
    patternCitations: asStringArray(o.pattern_citations),
  };
}

/** Requirement ids not referenced by any capability need or tradeoff (the "map everything" eval). */
export function unmappedRequirementIds(plan: PlannerResult, requirements: Requirement[]): string[] {
  const referenced = new Set<string>();
  for (const c of plan.capabilityNeeds) for (const r of c.requirementRefs) referenced.add(r);
  for (const t of plan.tradeoffs) for (const r of t.requirementRefs) referenced.add(r);
  return requirements.map((r) => r.id).filter((id) => !referenced.has(id));
}

/** Hard check (doc 17): the planner must emit abstract types only — no `aws.*`/`azure.*`/`gcp.*` keys. */
export function hasServiceBindings(plan: PlannerResult): boolean {
  return plan.capabilityNeeds.some((c) => /^(aws|azure|gcp|generic)\./.test(c.abstractType));
}
