import type Anthropic from '@anthropic-ai/sdk';
import { applyModelPatch, PatchError } from '@cac/caml';
import type { CamlDocument, JsonPatch } from '@cac/caml';
import type { AnthropicLike } from './requirements.agent';
import type { CriticFinding } from './critic.agent';

/**
 * Repair (blueprint doc 07 / doc 17 `repair/v1`, frontier tier). Fixes critic findings with
 * minimal, surgical RFC-6902 patches that preserve every untouched id. The patch is applied
 * through the CAML-aware patcher (`applyModelPatch`, which re-validates post-apply) — a patch
 * that would break the model is rejected and its findings deferred rather than emitting a
 * broken model. No scope creep: only what a finding names.
 */

export interface RepairResult {
  model: CamlDocument;
  applied: boolean;
  deferred: string[];
  usage: { inputTokens: number; outputTokens: number };
}

const CONTRACT_HINT = `{
  "patch": [ RFC-6902 operations against the model, e.g. { "op": "replace", "path": "/components/2/properties/storageEncrypted", "value": true } ],
  "deferred": [ "one-sentence note for any finding you cannot safely fix" ]
}`;

export async function runRepair(
  input: { model: CamlDocument; findings: CriticFinding[] },
  deps: { client: AnthropicLike; model: string; system: string; maxTokens?: number },
): Promise<RepairResult> {
  const findings = input.findings.map((f, i) => ({
    index: i,
    severity: f.severity,
    problem: f.problem,
    fix_instruction: f.fixInstruction,
    component_refs: f.componentRefs,
  }));
  const res = await deps.client.messages.create({
    model: deps.model,
    max_tokens: deps.maxTokens ?? 4000,
    thinking: { type: 'adaptive' },
    system: deps.system,
    messages: [
      {
        role: 'user',
        content:
          `Model:\n${JSON.stringify(input.model)}\n\nFindings to fix:\n${JSON.stringify(findings, null, 2)}\n\n` +
          `Return ONLY the repair JSON — no prose, no fences. Use 0-based array indices in patch paths:\n${CONTRACT_HINT}`,
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('repair: the model refused the request');
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const { patch, deferred } = parseRepair(text);

  let model = input.model;
  let applied = false;
  const deferredOut = [...deferred];
  if (patch.length > 0) {
    try {
      model = applyModelPatch(input.model, patch);
      applied = true;
    } catch (err) {
      if (!(err instanceof PatchError)) throw err;
      deferredOut.push(`patch did not apply cleanly: ${err.message}`);
    }
  }
  return { model, applied, deferred: deferredOut, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
}

function parseRepair(text: string): { patch: JsonPatch; deferred: string[] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('repair: no JSON object in model output');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('repair: model output was not valid JSON');
  }
  const o = raw as Record<string, unknown>;
  const patch = (Array.isArray(o.patch) ? o.patch : []).filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null) as unknown as JsonPatch;
  const deferred = (Array.isArray(o.deferred) ? o.deferred : []).map(String);
  return { patch, deferred };
}
