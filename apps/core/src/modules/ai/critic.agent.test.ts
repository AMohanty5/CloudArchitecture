import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { runCritic } from './critic.agent';
import type { AnthropicLike } from './requirements.agent';
import type { CamlDocument } from '@cac/caml';

const model = (storageEncrypted: boolean): CamlDocument => ({
  camlVersion: '1.0',
  id: 'arch_GENTEST0001',
  name: 'Gen',
  groups: [{ id: 'vpc', kind: 'network', name: 'VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } }],
  components: [
    { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'LB', binding: { provider: 'aws', service: 'aws.alb' } },
    { id: 'orders-db', type: 'database.relational', name: 'DB', group: 'vpc', binding: { provider: 'aws', service: 'aws.rds' }, properties: { engine: 'postgres', instanceClass: 'db.t3.micro', storageEncrypted } },
  ],
});

const textMsg = (text: string): Partial<Anthropic.Message> => ({ stop_reason: 'end_turn', content: [{ type: 'text', text, citations: null }] as unknown as Anthropic.ContentBlock[] });
const toolMsg = (name: string): Partial<Anthropic.Message> => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name, input: {} }] as unknown as Anthropic.ContentBlock[] });

function scriptedClient(responses: Array<Partial<Anthropic.Message>>): AnthropicLike {
  let i = 0;
  return { messages: { create: async () => ({ usage: { input_tokens: 1500, output_tokens: 600 }, stop_reason: 'end_turn', content: [], ...responses[i++] }) as unknown as Anthropic.Message } };
}

const deps = (client: AnthropicLike) => ({ client, model: 'claude-opus-4-8', system: 'sys' });
const REVISE = JSON.stringify({ verdict: 'revise', findings: [{ severity: 'critical', component_refs: ['orders-db'], problem: 'Datastore is unencrypted at rest', why_it_matters: 'data exposure', fix_instruction: 'set storageEncrypted to true' }] });

describe('runCritic', () => {
  it('calls run_validation, then parses a revise verdict + findings', async () => {
    const r = await runCritic({ target: model(false), requirements: [] }, deps(scriptedClient([toolMsg('run_validation'), textMsg(REVISE)])));
    expect(r.verdict).toBe('revise');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.componentRefs).toEqual(['orders-db']);
    expect(r.usage).toEqual({ inputTokens: 3000, outputTokens: 1200 }); // two turns
  });

  it('returns pass when there are no findings', async () => {
    const r = await runCritic({ target: model(true), requirements: [] }, deps(scriptedClient([textMsg(JSON.stringify({ verdict: 'pass', findings: [] }))])));
    expect(r.verdict).toBe('pass');
    expect(r.findings).toEqual([]);
  });

  it('throws on refusal', async () => {
    await expect(runCritic({ target: model(true), requirements: [] }, deps(scriptedClient([{ stop_reason: 'refusal', content: [] }])))).rejects.toThrow(/refused/);
  });
});
