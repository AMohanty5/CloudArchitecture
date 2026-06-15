import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasServiceBindings, runPlanner, unmappedRequirementIds } from './planner.agent';
import { loadPatterns } from './pattern-store';
import { getPrompt, loadPromptRegistry } from './prompt-registry';
import { anthropic, resolveModel } from './anthropic.provider';
import type { Requirement } from '@cac/caml';

/**
 * Golden eval for the Design Planner (doc 07). LIVE — runs only with ANTHROPIC_API_KEY;
 * the deterministic CI coverage is the mocked `planner.agent.test.ts`. Asserts the doc-17
 * planner contract structurally: every requirement mapped, no service bindings, ≥2 patterns
 * cited (the e-commerce acceptance).
 */

const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const here = path.dirname(fileURLToPath(import.meta.url));
const patternsDir = path.resolve(here, '../../../../../ai/patterns');
const promptsDir = path.resolve(here, '../../../../../ai/prompts');

const ECOMMERCE: Requirement[] = [
  { id: 'req-multiregion', kind: 'availability', statement: 'Survive a regional outage', quantity: { regions: 2 }, priority: 'must' },
  { id: 'req-throughput', kind: 'throughput', statement: '~30k peak RPS', quantity: { peak_rps: 30000 }, source: 'inferred', confidence: 0.7 },
  { id: 'req-pci', kind: 'compliance', statement: 'PCI DSS for card payments', source: 'inferred', confidence: 0.8 },
  { id: 'req-latency', kind: 'latency', statement: 'p99 page load under 300ms', quantity: { p99_ms: 300 } },
];

describe.skipIf(!LIVE)('planner agent — golden eval (live)', () => {
  it(
    'e-commerce requirements → ≥2 patterns cited, every requirement mapped, no service bindings',
    async () => {
      const patterns = loadPatterns(patternsDir);
      const system = getPrompt(loadPromptRegistry(promptsDir), 'planner').system;
      const plan = await runPlanner({ requirements: ECOMMERCE, provider: 'aws' }, { client: anthropic(), model: resolveModel('frontier'), system, patterns });

      expect(plan.patternCitations.length).toBeGreaterThanOrEqual(2);
      expect(unmappedRequirementIds(plan, ECOMMERCE)).toEqual([]);
      expect(hasServiceBindings(plan)).toBe(false);
      expect(plan.capabilityNeeds.length).toBeGreaterThan(0);
    },
    90_000,
  );
});

describe('planner eval harness', () => {
  it('defines the e-commerce golden case', () => {
    expect(ECOMMERCE.length).toBeGreaterThanOrEqual(4);
  });
});
