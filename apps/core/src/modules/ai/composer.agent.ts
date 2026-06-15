import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { validateStructure } from '@cac/caml';
import type { CamlDocument, CamlError } from '@cac/caml';
import { validateAgainstCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import type { AnthropicLike } from './requirements.agent';
import type { PlannerResult } from './planner.agent';
import { catalogSchema, catalogSearch } from './catalog-tools';
import type { Requirement } from '@cac/caml';

/**
 * Composer (blueprint doc 07 / doc 17 `composer/v1`, frontier tier → Opus). Turns the
 * capability plan into concrete, catalog-bound CAML. Two loops in one: a tool-use loop
 * (`catalog_search` / `catalog_schema` — bind only to real catalog keys) and a **repair
 * loop** — every candidate model is run through the deterministic pass-1 (structural) +
 * pass-2 (catalog) validation, and any errors are fed back for surgical repair. Hard gate:
 * persistent invalidity (e.g. a non-catalog service key) fails the job rather than emitting
 * a broken model.
 */

export interface ComposerResult {
  model: CamlDocument;
  repairs: number;
  usage: { inputTokens: number; outputTokens: number };
}

const CATALOG_SEARCH_TOOL: Anthropic.Tool = {
  name: 'catalog_search',
  description:
    'Search the cloud service catalog. Returns catalog keys with abstract types + one-line summaries. ALWAYS use this before binding a component to a service — never bind from memory.',
  input_schema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      provider: { enum: ['aws', 'azure', 'gcp'] },
      abstract_type: { type: 'string' },
      limit: { type: 'integer' },
    },
  },
};
const CATALOG_SCHEMA_TOOL: Anthropic.Tool = {
  name: 'catalog_schema',
  description: 'Fetch the property schema, connection rules, and capabilities for a catalog service key. Use before setting any properties on a bound component.',
  input_schema: { type: 'object', required: ['service_key'], properties: { service_key: { type: 'string' } } },
};

const CAML_HINT = `A CAML document, JSON only:
{
  "camlVersion": "1.0", "id": string, "name": string,
  "groups": [{ "id": kebab-id, "kind": "region"|"network"|"subnet"|"zone"|"tier", "name": string, "parent"?: group id, "provider"?: "aws", "properties"?: object }],
  "components": [{ "id": kebab-id, "type": CAML abstract type, "name": string, "group"?: group id, "binding"?: { "provider": "aws", "service": catalog key from catalog_search }, "properties"?: object }],
  "connections": [{ "id": kebab-id, "from": component id, "to": component id, "kind": "traffic"|"data"|"async"|"dependency", "properties"?: object }],
  "policies"?: [{ "id": kebab-id, "kind": "security.encryption"|"reliability.redundancy"|..., "statement": string, "enforce": "error"|"warn"|"info" }]
}
Bind EVERY component to a catalog service returned by catalog_search. Set security-relevant properties (encryption, public access) explicitly. Keep ids descriptive and stable.`;

function buildUserPrompt(input: { plan: PlannerResult; requirements: Requirement[]; provider?: string }): string {
  const plan = {
    groups_plan: input.plan.groupsPlan,
    capability_needs: input.plan.capabilityNeeds,
    connection_plan: input.plan.connectionPlan,
  };
  const reqs = input.requirements.map((r) => ({ id: r.id, kind: r.kind, statement: r.statement }));
  return (
    `Target provider: ${input.provider ?? 'aws'}\n\nCapability plan:\n${JSON.stringify(plan, null, 2)}\n\n` +
    `Requirements:\n${JSON.stringify(reqs, null, 2)}\n\n` +
    `Compose the full architecture. Use catalog_search/catalog_schema to bind components, then return ONLY the CAML document.\n${CAML_HINT}`
  );
}

function validate(model: CamlDocument, catalog: Catalog): CamlError[] {
  const structural = validateStructure(model);
  if (!structural.valid) return structural.errors;
  return validateAgainstCatalog(model, catalog).errors;
}

function summarize(errors: CamlError[]): string {
  return errors
    .slice(0, 12)
    .map((e) => `- ${e.path ?? e.element ?? '(document)'}: ${e.message}`)
    .join('\n');
}

function parseCaml(text: string, fallback: { id: string; name: string }): CamlDocument {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('composer: no JSON object in model output');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('composer: model output was not valid JSON');
  }
  const model = raw as CamlDocument;
  model.camlVersion = '1.0';
  if (typeof model.id !== 'string' || !model.id) model.id = fallback.id;
  if (typeof model.name !== 'string' || !model.name) model.name = fallback.name;
  if (!Array.isArray(model.components)) model.components = [];
  return model;
}

function execTool(tu: Anthropic.ToolUseBlock, catalog: Catalog): Anthropic.ToolResultBlockParam {
  const input = (tu.input ?? {}) as Record<string, unknown>;
  let payload: unknown;
  if (tu.name === 'catalog_search') {
    payload = catalogSearch(catalog, {
      query: String(input.query ?? ''),
      provider: typeof input.provider === 'string' ? input.provider : undefined,
      abstract_type: typeof input.abstract_type === 'string' ? input.abstract_type : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
  } else if (tu.name === 'catalog_schema') {
    payload = catalogSchema(catalog, String(input.service_key ?? ''));
  } else {
    payload = { error: `unknown tool ${tu.name}` };
  }
  return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(payload) };
}

export async function runComposer(
  input: { plan: PlannerResult; requirements: Requirement[]; name: string; provider?: string },
  deps: { client: AnthropicLike; model: string; system: string; catalog: Catalog; maxIterations?: number; maxRepairs?: number; maxTokens?: number },
): Promise<ComposerResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildUserPrompt(input) }];
  const fallback = { id: `arch_${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`, name: input.name };
  const maxRounds = deps.maxIterations ?? 10;
  const maxRepairs = deps.maxRepairs ?? 3;
  let inputTokens = 0;
  let outputTokens = 0;
  let repairs = 0;

  for (let round = 0; round < maxRounds; round++) {
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: deps.maxTokens ?? 8000,
      thinking: { type: 'adaptive' },
      system: deps.system,
      tools: [CATALOG_SEARCH_TOOL, CATALOG_SCHEMA_TOOL],
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    if (res.stop_reason === 'refusal') throw new Error('composer: the model refused the request');
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length > 0) {
      messages.push({ role: 'user', content: toolUses.map((tu) => execTool(tu, deps.catalog)) });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const model = parseCaml(text, fallback);
    const errors = validate(model, deps.catalog);
    if (errors.length === 0) return { model, repairs, usage: { inputTokens, outputTokens } };

    if (repairs >= maxRepairs) {
      throw new Error(`composer: failed to produce valid CAML after ${maxRepairs} repair round(s); last errors:\n${summarize(errors)}`);
    }
    repairs++;
    messages.push({
      role: 'user',
      content: `The CAML failed validation:\n${summarize(errors)}\nFix exactly these issues — bind only to keys returned by catalog_search — and return the full corrected CAML document as JSON only.`,
    });
  }
  throw new Error('composer: did not converge within the round budget');
}
