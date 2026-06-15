import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Prompt registry loader (blueprint doc 17). Prompts are code: versioned YAML under
 * `ai/prompts/<agent>/v*.yaml`, reviewed by PR and eval-gated in CI. This loader reads
 * the tree, validates the required fields, and indexes the highest *production* version
 * per agent id. Cloud facts never live in prompts — only role/method/contract/tools.
 */

export type ModelTier = 'frontier' | 'mid' | 'small';
export type PromptStatus = 'draft' | 'canary' | 'production' | 'retired';

export interface PromptSpec {
  id: string;
  version: number;
  modelTier: ModelTier;
  outputContract: string;
  tools: string[];
  status: PromptStatus;
  system: string;
}

export interface PromptRegistry {
  /** Highest production-status version per agent id. */
  byId: ReadonlyMap<string, PromptSpec>;
}

const MODEL_TIERS: ModelTier[] = ['frontier', 'mid', 'small'];
const STATUSES: PromptStatus[] = ['draft', 'canary', 'production', 'retired'];

function parseSpec(raw: unknown, rel: string): PromptSpec {
  const o = raw as Record<string, unknown>;
  const require = (key: string): unknown => {
    if (o[key] === undefined || o[key] === null) throw new Error(`${rel}: missing required field "${key}"`);
    return o[key];
  };
  const modelTier = require('model_tier') as ModelTier;
  if (!MODEL_TIERS.includes(modelTier)) throw new Error(`${rel}: invalid model_tier "${modelTier}"`);
  const status = require('status') as PromptStatus;
  if (!STATUSES.includes(status)) throw new Error(`${rel}: invalid status "${status}"`);
  return {
    id: String(require('id')),
    version: Number(require('version')),
    modelTier,
    outputContract: String(require('output_contract')),
    tools: Array.isArray(o.tools) ? (o.tools as string[]) : [],
    status,
    system: String(require('system')).trim(),
  };
}

/** Load and validate the prompt registry from a directory tree of `*.yaml` files. */
export function loadPromptRegistry(rootDir: string): PromptRegistry {
  const files = readdirSync(rootDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  const byId = new Map<string, PromptSpec>();
  for (const rel of files) {
    let parsed: unknown;
    try {
      parsed = parseYaml(readFileSync(join(rootDir, rel), 'utf8'));
    } catch (err) {
      throw new Error(`${rel}: YAML parse error: ${(err as Error).message}`);
    }
    const spec = parseSpec(parsed, rel);
    // Index only production prompts; keep the highest version when several exist.
    if (spec.status !== 'production') continue;
    const existing = byId.get(spec.id);
    if (!existing || spec.version > existing.version) byId.set(spec.id, spec);
  }
  return { byId };
}

export function getPrompt(registry: PromptRegistry, id: string): PromptSpec {
  const spec = registry.byId.get(id);
  if (!spec) throw new Error(`no production prompt registered for "${id}"`);
  return spec;
}
