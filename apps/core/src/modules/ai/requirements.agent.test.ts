import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { runRequirements } from './requirements.agent';
import type { AnthropicLike } from './requirements.agent';

/** A fake Anthropic client that returns one text block (the model's JSON contract). */
function mockClient(text: string, stopReason: Anthropic.Message['stop_reason'] = 'end_turn'): AnthropicLike {
  return {
    messages: {
      create: async () =>
        ({
          content: [{ type: 'text', text, citations: null }],
          usage: { input_tokens: 1200, output_tokens: 800 },
          stop_reason: stopReason,
        }) as unknown as Anthropic.Message,
    },
  };
}

const run = (text: string, stop?: Anthropic.Message['stop_reason']) =>
  runRequirements({ prompt: 'A multi-region e-commerce platform for 50M users' }, { client: mockClient(text, stop), model: 'claude-sonnet-4-6', system: 'sys' });

const GOOD = JSON.stringify({
  requirements: [
    { id: 'req-multiregion', kind: 'availability', statement: 'Survive a regional outage', quantity: { regions: 2 }, source: 'user', priority: 'must' },
    { id: 'req-throughput', kind: 'throughput', statement: '~30k peak RPS from 50M MAU', quantity: { peak_rps: 30000 }, source: 'inferred', confidence: 0.7 },
    { id: 'req-pci', kind: 'compliance', statement: 'PCI DSS for card payments', source: 'inferred', confidence: 0.8 },
  ],
  ambiguities: [{ id: 'a1', question: 'Is a budget ceiling defined?', kind: 'non_blocking', default_assumption: 'no hard cap' }],
  workload_class: 'ecommerce',
  flags: [],
});

describe('runRequirements — parsing', () => {
  it('maps the JSON contract into CAML requirements + ambiguities + usage', async () => {
    const r = await run(GOOD);
    expect(r.requirements).toHaveLength(3);
    expect(r.requirements.map((x) => x.kind)).toEqual(['availability', 'throughput', 'compliance']);
    expect(r.requirements[1]!.quantity).toEqual({ peak_rps: 30000 });
    expect(r.requirements.filter((x) => x.source === 'inferred')).toHaveLength(2);
    expect(r.ambiguities[0]!.defaultAssumption).toBe('no hard cap');
    expect(r.workloadClass).toBe('ecommerce');
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 800 });
  });

  it('tolerates markdown fences and surrounding prose', async () => {
    const r = await run('Here are the requirements:\n```json\n' + GOOD + '\n```\nLet me know if you need more.');
    expect(r.requirements).toHaveLength(3);
  });

  it('coerces an unknown requirement kind to "other"', async () => {
    const r = await run(JSON.stringify({ requirements: [{ id: 'x', kind: 'made_up', statement: 'something' }], ambiguities: [], workload_class: 'x', flags: [] }));
    expect(r.requirements[0]!.kind).toBe('other');
  });

  it('drops requirements with an empty statement', async () => {
    const r = await run(JSON.stringify({ requirements: [{ id: 'x', kind: 'security', statement: '' }], ambiguities: [], workload_class: 'x', flags: [] }));
    expect(r.requirements).toHaveLength(0);
  });

  it('throws on a refusal', async () => {
    await expect(run(GOOD, 'refusal')).rejects.toThrow(/refused/);
  });

  it('throws on non-JSON output', async () => {
    await expect(run('I cannot help with that.')).rejects.toThrow(/not valid JSON|no JSON object/);
  });
});
