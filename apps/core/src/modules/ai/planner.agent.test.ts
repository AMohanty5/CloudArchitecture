import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { hasServiceBindings, runPlanner, unmappedRequirementIds } from './planner.agent';
import type { AnthropicLike } from './requirements.agent';
import { loadPatterns } from './pattern-store';
import type { Requirement } from '@cac/caml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const patterns = loadPatterns(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/patterns'));

const REQUIREMENTS: Requirement[] = [
  { id: 'req-ha', kind: 'availability', statement: 'Survive a regional outage' },
  { id: 'req-tput', kind: 'throughput', statement: '~30k peak RPS' },
];

const PLAN_JSON = JSON.stringify({
  groups_plan: [{ id: 'region-1', kind: 'region', purpose: 'primary' }],
  capability_needs: [
    { id: 'entry', abstract_type: 'network.loadbalancer.l7', purpose: 'entry', requirement_refs: ['req-tput'], pattern_ref: 'web-3tier-ha' },
    { id: 'app', abstract_type: 'compute.vm.autoscaling_group', purpose: 'app tier', requirement_refs: ['req-ha', 'req-tput'] },
    { id: 'db', abstract_type: 'database.relational', purpose: 'datastore', requirement_refs: ['req-ha'] },
  ],
  connection_plan: [{ from: 'entry', to: 'app', kind: 'traffic' }],
  tradeoffs: [{ decision: 'multi-AZ over single', rationale: 'availability', requirement_refs: ['req-ha'] }],
  pattern_citations: ['web-3tier-ha', 'event-driven-core'],
});

/** A mock client that replays a scripted sequence of responses, one per create() call. */
function scriptedClient(responses: Array<Partial<Anthropic.Message>>): AnthropicLike {
  let i = 0;
  return {
    messages: {
      create: async () =>
        ({ usage: { input_tokens: 1000, output_tokens: 500 }, stop_reason: 'end_turn', content: [], ...responses[i++] }) as unknown as Anthropic.Message,
    },
  };
}

const toolUseResponse: Partial<Anthropic.Message> = {
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu1', name: 'pattern_fetch', input: { need: '3-tier web app' } }] as unknown as Anthropic.ContentBlock[],
};
const planResponse: Partial<Anthropic.Message> = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: PLAN_JSON, citations: null }] as unknown as Anthropic.ContentBlock[],
};

const deps = (client: AnthropicLike) => ({ client, model: 'claude-opus-4-8', system: 'sys', patterns, maxIterations: 4 });

describe('runPlanner — tool-use loop', () => {
  it('calls pattern_fetch then parses the capability plan, summing usage across turns', async () => {
    const plan = await runPlanner({ requirements: REQUIREMENTS }, deps(scriptedClient([toolUseResponse, planResponse])));
    expect(plan.capabilityNeeds.map((c) => c.abstractType)).toEqual([
      'network.loadbalancer.l7',
      'compute.vm.autoscaling_group',
      'database.relational',
    ]);
    expect(plan.patternCitations.length).toBeGreaterThanOrEqual(2);
    expect(plan.usage).toEqual({ inputTokens: 2000, outputTokens: 1000 }); // two model turns
  });

  it('maps every requirement (no unmapped ids) and emits no service bindings', async () => {
    const plan = await runPlanner({ requirements: REQUIREMENTS }, deps(scriptedClient([toolUseResponse, planResponse])));
    expect(unmappedRequirementIds(plan, REQUIREMENTS)).toEqual([]);
    expect(hasServiceBindings(plan)).toBe(false);
  });

  it('flags a plan that leaked a service binding', async () => {
    const leaky = JSON.stringify({
      capability_needs: [{ id: 'db', abstract_type: 'aws.rds', purpose: 'x', requirement_refs: ['req-ha'] }],
      pattern_citations: ['web-3tier-ha'],
    });
    const plan = await runPlanner({ requirements: REQUIREMENTS }, deps(scriptedClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: leaky, citations: null }] as unknown as Anthropic.ContentBlock[] }])));
    expect(hasServiceBindings(plan)).toBe(true);
  });

  it('throws on refusal', async () => {
    await expect(runPlanner({ requirements: REQUIREMENTS }, deps(scriptedClient([{ stop_reason: 'refusal', content: [] }])))).rejects.toThrow(/refused/);
  });

  it('throws if it never converges within the iteration budget', async () => {
    const d = { ...deps(scriptedClient([toolUseResponse, toolUseResponse])), maxIterations: 2 };
    await expect(runPlanner({ requirements: REQUIREMENTS }, d)).rejects.toThrow(/converge/);
  });
});
