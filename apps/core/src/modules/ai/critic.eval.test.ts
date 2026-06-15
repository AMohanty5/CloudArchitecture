import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCritic } from './critic.agent';
import { orchestrateReview } from './orchestrate';
import { getPrompt, loadPromptRegistry } from './prompt-registry';
import { anthropic, resolveModel } from './anthropic.provider';
import type { CamlDocument, Requirement } from '@cac/caml';

/**
 * Critic + closed-loop golden eval (doc 07). LIVE — gated on ANTHROPIC_API_KEY; the
 * deterministic CI coverage is the mocked critic/repair/orchestrate tests. The seeded-defect
 * case (doc 07 eval philosophy) injects a known weakness and asserts the critic catches it
 * and the loop repairs it — the Day-34/35 acceptance ("single-AZ DB caught and repaired").
 */

const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/prompts');

const seeded = (defects: { storageEncrypted?: boolean; multiAz?: boolean }): CamlDocument => ({
  camlVersion: '1.0',
  id: 'arch_GENEVAL0001',
  name: 'Seeded',
  groups: [
    { id: 'vpc', kind: 'network', name: 'VPC', provider: 'aws', properties: { cidr: '10.0.0.0/16' } },
    { id: 'sub', kind: 'subnet', name: 'Sub', parent: 'vpc', provider: 'aws', properties: { cidr: '10.0.1.0/24' } },
  ],
  components: [
    { id: 'web-lb', type: 'network.loadbalancer.l7', name: 'LB', binding: { provider: 'aws', service: 'aws.alb' } },
    { id: 'app', type: 'compute.vm.autoscaling_group', name: 'App', group: 'sub', binding: { provider: 'aws', service: 'aws.ec2_asg' } },
    {
      id: 'orders-db',
      type: 'database.relational',
      name: 'Orders DB',
      group: 'sub',
      binding: { provider: 'aws', service: 'aws.rds' },
      properties: { engine: 'postgres', instanceClass: 'db.t3.micro', storageEncrypted: defects.storageEncrypted ?? true, multiAz: defects.multiAz ?? true },
    },
  ],
  connections: [
    { id: 'lb-app', from: 'web-lb', to: 'app', kind: 'traffic' },
    { id: 'app-db', from: 'app', to: 'orders-db', kind: 'data' },
  ],
});

const HA_REQ: Requirement[] = [{ id: 'req-ha', kind: 'availability', statement: 'Survive an AZ failure', priority: 'must' }];

describe.skipIf(!LIVE)('critic + closed loop (live)', () => {
  const critic = () => getPrompt(loadPromptRegistry(promptsDir), 'critic').system;
  const repair = () => getPrompt(loadPromptRegistry(promptsDir), 'repair').system;

  it('catches a seeded encryption defect', async () => {
    const r = await runCritic({ target: seeded({ storageEncrypted: false }), requirements: [] }, { client: anthropic(), model: resolveModel('frontier'), system: critic() });
    expect(r.verdict).toBe('revise');
    expect(r.findings.some((f) => /encrypt/i.test(f.problem) || f.componentRefs.includes('orders-db'))).toBe(true);
  }, 90_000);

  it('catches AND repairs a single-AZ DB under an availability requirement', async () => {
    const review = await orchestrateReview(
      { model: seeded({ multiAz: false }), requirements: HA_REQ },
      { client: anthropic(), model: resolveModel('frontier'), criticSystem: critic(), repairSystem: repair() },
    );
    expect(review.initialFindings.length).toBeGreaterThan(0);
    // The defect is addressed: either repaired, or strictly fewer findings remain.
    expect(review.repairs > 0 || review.remainingFindings.length < review.initialFindings.length).toBe(true);
  }, 180_000);
});

describe('critic eval harness', () => {
  it('seeds a known defect fixture', () => {
    expect(seeded({ multiAz: false }).components.find((c) => c.id === 'orders-db')!.properties!.multiAz).toBe(false);
  });
});
