import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runRequirements } from './requirements.agent';
import type { RequirementsResult } from './requirements.agent';
import { getPrompt, loadPromptRegistry } from './prompt-registry';
import { anthropic, resolveModel } from './anthropic.provider';

/**
 * Golden eval suite for the requirements agent (blueprint doc 07 — structural assertions
 * on the model's output). LIVE: runs only when ANTHROPIC_API_KEY is set (CI without a key
 * skips the whole block); the deterministic CI coverage is the mocked `requirements.agent.test.ts`.
 * Assertions are intentionally structural and lenient (kind presence, inference labelling,
 * numeric quantities) so they catch regressions without being prompt-brittle.
 */

const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/prompts');

const hasKind = (r: RequirementsResult, ...kinds: string[]): boolean => r.requirements.some((x) => kinds.includes(x.kind));
const matches = (r: RequirementsResult, re: RegExp): boolean =>
  r.requirements.some((x) => re.test(x.statement) || re.test(JSON.stringify(x.quantity ?? {})));
const hasInferred = (r: RequirementsResult): boolean => r.requirements.some((x) => x.source === 'inferred');

interface EvalCase {
  name: string;
  prompt: string;
  check: (r: RequirementsResult) => void;
}

const CASES: EvalCase[] = [
  {
    name: 'multi-region e-commerce, 50M users → availability + inferred throughput',
    prompt: 'Design a highly available multi-region e-commerce platform on AWS serving 50M users.',
    check: (r) => {
      expect(hasKind(r, 'availability')).toBe(true);
      expect(hasKind(r, 'throughput', 'scalability')).toBe(true);
      expect(hasInferred(r)).toBe(true);
      expect(r.workloadClass.toLowerCase()).toMatch(/commerce|ecommerce|retail/);
    },
  },
  {
    name: 'HIPAA patient portal → compliance (health)',
    prompt: 'A patient portal that stores medical records for a US hospital.',
    check: (r) => {
      expect(hasKind(r, 'compliance')).toBe(true);
      expect(matches(r, /hipaa|phi|health/i)).toBe(true);
    },
  },
  {
    name: 'PCI payments → compliance (pci)',
    prompt: 'A payment service that processes credit card transactions.',
    check: (r) => expect(matches(r, /pci/i)).toBe(true),
  },
  {
    name: 'low-latency trading → latency requirement',
    prompt: 'A trading system that must respond in under 10 milliseconds at p99.',
    check: (r) => {
      expect(hasKind(r, 'latency')).toBe(true);
      expect(matches(r, /10|ms|millisecond|p99/i)).toBe(true);
    },
  },
  {
    name: '99.99% uptime → availability with quantity',
    prompt: 'An API that must maintain 99.99% uptime.',
    check: (r) => {
      expect(hasKind(r, 'availability')).toBe(true);
      expect(matches(r, /99\.9|0\.999|slo/i)).toBe(true);
    },
  },
  {
    name: 'budget ceiling → budget requirement',
    prompt: 'A web app with a hard cloud budget of $5,000 per month.',
    check: (r) => {
      expect(hasKind(r, 'budget')).toBe(true);
      expect(matches(r, /5000|5,000|month|usd/i)).toBe(true);
    },
  },
  {
    name: 'EU data residency → data_residency',
    prompt: 'A SaaS app that must keep all EU citizen data inside the EU.',
    check: (r) => {
      expect(hasKind(r, 'data_residency', 'compliance')).toBe(true);
      expect(matches(r, /eu|europe|residen/i)).toBe(true);
    },
  },
  {
    name: 'RPO/RTO stated → rpo_rto',
    prompt: 'A core banking ledger with RPO of 5 minutes and RTO of 1 hour.',
    check: (r) => {
      expect(hasKind(r, 'rpo_rto', 'durability', 'availability')).toBe(true);
      expect(matches(r, /rpo|rto|5|60|minute|hour/i)).toBe(true);
    },
  },
  {
    name: '10k orders/sec → throughput with a numeric quantity',
    prompt: 'An order pipeline that ingests 10,000 orders per second at peak.',
    check: (r) => {
      expect(hasKind(r, 'throughput', 'scalability')).toBe(true);
      expect(matches(r, /10000|10,000|rps|per second/i)).toBe(true);
    },
  },
  {
    name: "children's app → inferred child-privacy compliance",
    prompt: 'A learning app for elementary school children.',
    check: (r) => {
      expect(hasKind(r, 'compliance')).toBe(true);
      expect(matches(r, /coppa|child|minor|ferpa/i)).toBe(true);
    },
  },
  {
    name: '50M MAU only → inferred throughput via the heuristic',
    prompt: 'A social feed with 50 million monthly active users.',
    check: (r) => {
      expect(hasKind(r, 'throughput', 'scalability')).toBe(true);
      expect(hasInferred(r)).toBe(true);
    },
  },
  {
    name: 'global users → availability or latency',
    prompt: 'A video site with users distributed across every continent.',
    check: (r) => expect(hasKind(r, 'availability', 'latency', 'scalability')).toBe(true),
  },
  {
    name: 'small internal tool → no fabricated hyperscale',
    prompt: 'A small internal admin dashboard for a team of 20.',
    check: (r) => {
      expect(r.requirements.length).toBeGreaterThan(0);
      expect(matches(r, /50m|million|100000|1000000/i)).toBe(false);
    },
  },
  {
    name: 'durable archival store → durability',
    prompt: 'A system that must never lose uploaded legal documents.',
    check: (r) => expect(hasKind(r, 'durability', 'compliance', 'security')).toBe(true),
  },
  {
    name: '1M concurrent chat → scalability/throughput',
    prompt: 'A real-time chat service supporting 1 million concurrent connections.',
    check: (r) => {
      expect(hasKind(r, 'scalability', 'throughput')).toBe(true);
      expect(matches(r, /1m|million|1000000|concurrent/i)).toBe(true);
    },
  },
];

describe.skipIf(!LIVE)('requirements agent — golden evals (live)', () => {
  // Built lazily inside the test: the skipIf suite body still runs at collection, and
  // anthropic() throws without a key — so construction must wait until a test executes.
  const system = (): string => getPrompt(loadPromptRegistry(promptsDir), 'requirements').system;

  it.each(CASES)('$name', async ({ prompt, check }) => {
    const result = await runRequirements({ prompt }, { client: anthropic(), model: resolveModel('mid'), system: system() });
    check(result);
  }, 60_000);
});

// A guard so the file always has at least one executed test (vitest errors on an all-skipped file otherwise).
describe('requirements eval harness', () => {
  it('defines a golden suite of cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
  });
});
