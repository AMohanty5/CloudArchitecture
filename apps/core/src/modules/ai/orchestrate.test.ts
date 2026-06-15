import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { orchestrateReview } from './orchestrate';
import type { AnthropicLike } from './requirements.agent';
import type { CamlDocument } from '@cac/caml';

const target: CamlDocument = {
  camlVersion: '1.0',
  id: 'arch_GENTEST0001',
  name: 'Gen',
  groups: [{ id: 'vpc', kind: 'network', name: 'VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } }],
  components: [
    { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'LB', binding: { provider: 'aws', service: 'aws.alb' } },
    { id: 'orders-db', type: 'database.relational', name: 'DB', group: 'vpc', binding: { provider: 'aws', service: 'aws.rds' }, properties: { engine: 'postgres', instanceClass: 'db.t3.micro', storageEncrypted: false } },
  ],
};

const textMsg = (text: string): Partial<Anthropic.Message> => ({ stop_reason: 'end_turn', content: [{ type: 'text', text, citations: null }] as unknown as Anthropic.ContentBlock[] });
function scriptedClient(responses: Array<Partial<Anthropic.Message>>): AnthropicLike {
  let i = 0;
  return { messages: { create: async () => ({ usage: { input_tokens: 1000, output_tokens: 400 }, stop_reason: 'end_turn', content: [], ...responses[i++] }) as unknown as Anthropic.Message } };
}

const REVISE = JSON.stringify({ verdict: 'revise', findings: [{ severity: 'critical', component_refs: ['orders-db'], problem: 'unencrypted db', why_it_matters: 'x', fix_instruction: 'set storageEncrypted true' }] });
const REPAIR = JSON.stringify({ patch: [{ op: 'replace', path: '/components/1/properties/storageEncrypted', value: true }], deferred: [] });
const PASS = JSON.stringify({ verdict: 'pass', findings: [] });

describe('orchestrateReview — closed loop', () => {
  it('critic (revise) → repair → critic (pass): fixes the defect and converges', async () => {
    const client = scriptedClient([textMsg(REVISE), textMsg(REPAIR), textMsg(PASS)]);
    const review = await orchestrateReview(
      { model: target, requirements: [] },
      { client, model: 'claude-opus-4-8', criticSystem: 'critic', repairSystem: 'repair' },
    );
    expect(review.iterations).toBe(2);
    expect(review.repairs).toBe(1);
    expect(review.remainingFindings).toEqual([]);
    expect(review.initialFindings).toHaveLength(1);
    expect(review.finalModel.components.find((c) => c.id === 'orders-db')!.properties!.storageEncrypted).toBe(true);
    expect(review.usage.inputTokens).toBe(3000); // critic + repair + critic
  });

  it('stops after the iteration budget, surfacing remaining findings', async () => {
    // Critic always says revise; repair never changes anything (empty patch) → loop bails early.
    const noop = JSON.stringify({ patch: [], deferred: ['cannot fix automatically'] });
    const client = scriptedClient([textMsg(REVISE), textMsg(noop)]);
    const review = await orchestrateReview(
      { model: target, requirements: [] },
      { client, model: 'claude-opus-4-8', criticSystem: 'critic', repairSystem: 'repair', maxIterations: 3 },
    );
    expect(review.repairs).toBe(0);
    expect(review.remainingFindings).toHaveLength(1);
  });
});
