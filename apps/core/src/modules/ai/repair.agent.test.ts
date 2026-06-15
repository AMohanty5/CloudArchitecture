import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { runRepair } from './repair.agent';
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

const finding = { severity: 'critical', componentRefs: ['orders-db'], problem: 'unencrypted', whyItMatters: 'x', fixInstruction: 'set storageEncrypted true' };

const textMsg = (text: string): Partial<Anthropic.Message> => ({ stop_reason: 'end_turn', content: [{ type: 'text', text, citations: null }] as unknown as Anthropic.ContentBlock[] });
function client(responses: Array<Partial<Anthropic.Message>>): AnthropicLike {
  let i = 0;
  return { messages: { create: async () => ({ usage: { input_tokens: 1200, output_tokens: 400 }, stop_reason: 'end_turn', content: [], ...responses[i++] }) as unknown as Anthropic.Message } };
}
const deps = (c: AnthropicLike) => ({ client: c, model: 'claude-opus-4-8', system: 'sys' });

const dbProps = (m: CamlDocument): Record<string, unknown> => (m.components.find((c) => c.id === 'orders-db')!.properties ?? {});

describe('runRepair', () => {
  it('applies a valid RFC-6902 patch through the CAML-aware patcher', async () => {
    const patch = JSON.stringify({ patch: [{ op: 'replace', path: '/components/1/properties/storageEncrypted', value: true }], deferred: [] });
    const r = await runRepair({ model: target, findings: [finding] }, deps(client([textMsg(patch)])));
    expect(r.applied).toBe(true);
    expect(dbProps(r.model).storageEncrypted).toBe(true);
    expect(dbProps(target).storageEncrypted).toBe(false); // input not mutated
  });

  it('defers (does not apply) a patch that would not apply cleanly', async () => {
    const patch = JSON.stringify({ patch: [{ op: 'replace', path: '/components/99/properties/x', value: 1 }], deferred: [] });
    const r = await runRepair({ model: target, findings: [finding] }, deps(client([textMsg(patch)])));
    expect(r.applied).toBe(false);
    expect(r.deferred.length).toBeGreaterThan(0);
    expect(r.model).toBe(target); // unchanged
  });

  it('throws on refusal', async () => {
    await expect(runRepair({ model: target, findings: [finding] }, deps(client([{ stop_reason: 'refusal', content: [] }])))).rejects.toThrow(/refused/);
  });
});
