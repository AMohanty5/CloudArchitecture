import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateStructure } from '@cac/caml';
import { loadCatalog, validateAgainstCatalog } from '@cac/catalog';
import { runComposer } from './composer.agent';
import type { PlannerResult } from './planner.agent';
import { getPrompt, loadPromptRegistry } from './prompt-registry';
import { anthropic, resolveModel } from './anthropic.provider';
import type { Requirement } from '@cac/caml';

/**
 * Golden eval for the Composer (doc 07). LIVE — gated on ANTHROPIC_API_KEY; the
 * deterministic CI coverage is the mocked `composer.agent.test.ts`. Asserts the doc-30
 * acceptance: the composed model is pass-1 (structural) + pass-2 (catalog) clean and binds
 * only to real catalog service keys.
 */

const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog(path.resolve(here, '../../../../../catalog'));
const promptsDir = path.resolve(here, '../../../../../ai/prompts');

const REQUIREMENTS: Requirement[] = [
  { id: 'req-ha', kind: 'availability', statement: 'Survive an AZ failure', priority: 'must' },
  { id: 'req-tput', kind: 'throughput', statement: '~30k peak RPS', quantity: { peak_rps: 30000 } },
  { id: 'req-enc', kind: 'security', statement: 'Encrypt data at rest' },
];
const PLAN: PlannerResult = {
  groupsPlan: [
    { id: 'region', kind: 'region', purpose: 'primary' },
    { id: 'vpc', kind: 'network', purpose: 'isolation' },
    { id: 'subnet-app', kind: 'subnet', purpose: 'app tier' },
  ],
  capabilityNeeds: [
    { id: 'entry', abstractType: 'network.loadbalancer.l7', purpose: 'internet entry', requirementRefs: ['req-tput'], patternRef: 'web-3tier-ha' },
    { id: 'app', abstractType: 'compute.vm.autoscaling_group', purpose: 'app tier', requirementRefs: ['req-ha', 'req-tput'] },
    { id: 'db', abstractType: 'database.relational', purpose: 'primary datastore', requirementRefs: ['req-ha', 'req-enc'] },
  ],
  connectionPlan: [
    { from: 'entry', to: 'app', kind: 'traffic' },
    { from: 'app', to: 'db', kind: 'data' },
  ],
  tradeoffs: [],
  patternCitations: ['web-3tier-ha'],
  usage: { inputTokens: 0, outputTokens: 0 },
};

describe.skipIf(!LIVE)('composer agent — golden eval (live)', () => {
  it(
    'plan → pass-1+2-valid CAML bound only to catalog services',
    async () => {
      const system = getPrompt(loadPromptRegistry(promptsDir), 'composer').system;
      const { model } = await runComposer(
        { plan: PLAN, requirements: REQUIREMENTS, name: 'AI eval', provider: 'aws' },
        { client: anthropic(), model: resolveModel('frontier'), system, catalog },
      );

      expect(validateStructure(model).valid).toBe(true);
      expect(validateAgainstCatalog(model, catalog).errors).toEqual([]);
      for (const c of model.components ?? []) {
        if (c.binding) expect(catalog.servicesByKey.has(c.binding.service)).toBe(true);
      }
    },
    120_000,
  );
});

describe('composer eval harness', () => {
  it('defines a plan + requirements fixture', () => {
    expect(PLAN.capabilityNeeds.length).toBeGreaterThan(0);
  });
});
