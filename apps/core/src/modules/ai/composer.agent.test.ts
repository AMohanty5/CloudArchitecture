import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@cac/catalog';
import { runComposer } from './composer.agent';
import type { AnthropicLike } from './requirements.agent';
import type { PlannerResult } from './planner.agent';

const catalog = loadCatalog(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../catalog'));

const PLAN: PlannerResult = {
  groupsPlan: [{ id: 'vpc', kind: 'network' }],
  capabilityNeeds: [
    { id: 'lb', abstractType: 'network.loadbalancer.l7', purpose: 'entry', requirementRefs: ['req-1'] },
    { id: 'db', abstractType: 'database.relational', purpose: 'store', requirementRefs: ['req-1'] },
  ],
  connectionPlan: [],
  tradeoffs: [],
  patternCitations: ['web-3tier-ha'],
  usage: { inputTokens: 0, outputTokens: 0 },
};

/** A catalog-valid 3-tier model; `dbService` lets a test inject a non-catalog key. */
const body = (dbService: string): string =>
  JSON.stringify({
    groups: [
      { id: 'vpc', kind: 'network', name: 'VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } },
      { id: 'sub', kind: 'subnet', name: 'Sub', parent: 'vpc', provider: 'aws', properties: { cidr: '10.0.1.0/24' } },
    ],
    components: [
      { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'LB', binding: { provider: 'aws', service: 'aws.alb' } },
      { id: 'app', type: 'compute.vm.autoscaling_group', name: 'App', group: 'sub', binding: { provider: 'aws', service: 'aws.ec2_asg' } },
      { id: 'db', type: 'database.relational', name: 'DB', group: 'sub', binding: { provider: 'aws', service: dbService }, properties: { engine: 'postgres', instanceClass: 'db.t3.micro' } },
    ],
    connections: [
      { id: 'lb-app', from: 'web-lb', to: 'app', kind: 'traffic' },
      { id: 'app-db', from: 'app', to: 'db', kind: 'data' },
    ],
  });

const textMsg = (text: string): Partial<Anthropic.Message> => ({ stop_reason: 'end_turn', content: [{ type: 'text', text, citations: null }] as unknown as Anthropic.ContentBlock[] });
const toolMsg = (name: string, input: unknown): Partial<Anthropic.Message> => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu1', name, input }] as unknown as Anthropic.ContentBlock[],
});

function scriptedClient(responses: Array<Partial<Anthropic.Message>>): AnthropicLike {
  let i = 0;
  return {
    messages: { create: async () => ({ usage: { input_tokens: 2000, output_tokens: 1500 }, stop_reason: 'end_turn', content: [], ...responses[i++] }) as unknown as Anthropic.Message },
  };
}

const deps = (client: AnthropicLike, maxRepairs?: number) => ({ client, model: 'claude-opus-4-8', system: 'sys', catalog, maxRepairs });
const input = { plan: PLAN, requirements: [{ id: 'req-1', kind: 'availability' as const, statement: 'HA' }], name: 'Gen', provider: 'aws' };

describe('runComposer — compose + repair loop', () => {
  it('returns a pass-1+2-valid model on the first try', async () => {
    const r = await runComposer(input, deps(scriptedClient([textMsg(body('aws.rds'))])));
    expect(r.repairs).toBe(0);
    expect(r.model.components).toHaveLength(3);
    expect(r.model.id).toMatch(/^arch_[A-Z0-9]{12}$/);
    expect(r.usage.outputTokens).toBe(1500);
  });

  it('runs catalog tools before composing', async () => {
    const r = await runComposer(input, deps(scriptedClient([toolMsg('catalog_search', { query: 'relational database', abstract_type: 'database.relational' }), textMsg(body('aws.rds'))])));
    expect(r.model.components).toHaveLength(3);
    expect(r.usage.inputTokens).toBe(4000); // two model turns
  });

  it('repairs a non-catalog service key (hard gate) and re-validates', async () => {
    const r = await runComposer(input, deps(scriptedClient([textMsg(body('aws.bogus')), textMsg(body('aws.rds'))])));
    expect(r.repairs).toBe(1);
    expect(r.model.components.find((c) => c.id === 'db')?.binding?.service).toBe('aws.rds');
  });

  it('fails the job when invalidity persists past the repair budget', async () => {
    await expect(
      runComposer(input, deps(scriptedClient([textMsg(body('aws.bogus')), textMsg(body('aws.bogus'))]), 1)),
    ).rejects.toThrow(/failed to produce valid CAML/);
  });

  it('throws on refusal', async () => {
    await expect(runComposer(input, deps(scriptedClient([{ stop_reason: 'refusal', content: [] }])))).rejects.toThrow(/refused/);
  });
});
