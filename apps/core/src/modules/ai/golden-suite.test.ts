import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runRequirements } from './requirements.agent';
import type { RequirementsResult } from './requirements.agent';
import { getPrompt, loadPromptRegistry } from './prompt-registry';
import { anthropic, resolveModel } from './anthropic.provider';

/**
 * Stage-E golden suite (blueprint doc 07): 30 prompt → expected-property cases across
 * workload classes, asserted structurally on the requirements agent's output (the cheapest,
 * highest-signal stage; the same harness points deeper for full-pipeline runs). LIVE — gated
 * on ANTHROPIC_API_KEY. The north-star is the pass rate (doc 07 target ≥ 80%).
 */

const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/prompts');

const kind = (r: RequirementsResult, ...kinds: string[]): boolean => r.requirements.some((x) => kinds.includes(x.kind));
const re = (r: RequirementsResult, rx: RegExp): boolean =>
  r.requirements.some((x) => rx.test(x.statement) || rx.test(JSON.stringify(x.quantity ?? {}))) || rx.test(r.workloadClass);
const inferred = (r: RequirementsResult): boolean => r.requirements.some((x) => x.source === 'inferred');

interface Case {
  name: string;
  prompt: string;
  check: (r: RequirementsResult) => void;
}

export const GOLDEN_CASES: Case[] = [
  { name: 'web/commerce HA multi-region 50M', prompt: 'A highly available multi-region e-commerce platform on AWS for 50M users.', check: (r) => { expect(kind(r, 'availability')).toBe(true); expect(kind(r, 'throughput', 'scalability')).toBe(true); expect(inferred(r)).toBe(true); } },
  { name: 'web/SaaS 99.99%', prompt: 'A B2B SaaS app that must maintain 99.99% uptime.', check: (r) => { expect(kind(r, 'availability')).toBe(true); expect(re(r, /99\.9|slo/i)).toBe(true); } },
  { name: 'serverless API spiky', prompt: 'A serverless HTTP API with spiky traffic and a key-value store.', check: (r) => expect(kind(r, 'scalability', 'throughput', 'availability')).toBe(true) },
  { name: 'serverless image processing', prompt: 'Serverless image resizing triggered by uploads.', check: (r) => expect(r.requirements.length).toBeGreaterThan(0) },
  { name: 'realtime chat 1M concurrent', prompt: 'A real-time chat service supporting 1 million concurrent connections.', check: (r) => { expect(kind(r, 'scalability', 'throughput')).toBe(true); expect(re(r, /1m|million|concurrent|1000000/i)).toBe(true); } },
  { name: 'low-latency trading', prompt: 'A trading system that must respond under 10ms p99.', check: (r) => { expect(kind(r, 'latency')).toBe(true); expect(re(r, /ms|millisecond|10|p99/i)).toBe(true); } },
  { name: 'fintech ledger RPO/RTO', prompt: 'A core banking ledger with RPO 5 minutes and RTO 1 hour.', check: (r) => { expect(kind(r, 'rpo_rto', 'durability', 'availability')).toBe(true); expect(re(r, /rpo|rto|minute|hour|5|60/i)).toBe(true); } },
  { name: 'PCI payments', prompt: 'A payment service processing credit-card transactions.', check: (r) => { expect(kind(r, 'compliance')).toBe(true); expect(re(r, /pci/i)).toBe(true); } },
  { name: 'HIPAA health', prompt: 'A patient portal storing medical records for a US hospital.', check: (r) => { expect(kind(r, 'compliance')).toBe(true); expect(re(r, /hipaa|phi|health/i)).toBe(true); } },
  { name: "children's COPPA", prompt: 'A learning app for elementary school children.', check: (r) => { expect(kind(r, 'compliance')).toBe(true); expect(re(r, /coppa|child|ferpa|minor/i)).toBe(true); } },
  { name: 'EU data residency', prompt: 'A SaaS that must keep EU citizen data within the EU.', check: (r) => { expect(kind(r, 'data_residency', 'compliance')).toBe(true); expect(re(r, /eu|europe|residen/i)).toBe(true); } },
  { name: 'budget ceiling', prompt: 'A web app with a hard cloud budget of $5,000/month.', check: (r) => { expect(kind(r, 'budget')).toBe(true); expect(re(r, /5000|5,000|month|usd/i)).toBe(true); } },
  { name: 'data/batch ETL warehouse', prompt: 'A nightly ETL pipeline landing data in a warehouse for analytics.', check: (r) => expect(r.requirements.length).toBeGreaterThan(0) },
  { name: 'high-throughput orders', prompt: 'An order pipeline ingesting 10,000 orders per second at peak.', check: (r) => { expect(kind(r, 'throughput', 'scalability')).toBe(true); expect(re(r, /10000|10,000|per second|rps/i)).toBe(true); } },
  { name: 'streaming analytics', prompt: 'Real-time clickstream analytics over a high-volume event stream.', check: (r) => expect(kind(r, 'throughput', 'scalability', 'latency')).toBe(true) },
  { name: 'event-driven decoupling', prompt: 'An event-driven order-fulfilment system decoupling producers and consumers.', check: (r) => expect(r.requirements.length).toBeGreaterThan(0) },
  { name: 'ML inference low latency', prompt: 'A model-serving API for ML inference with low latency at scale.', check: (r) => expect(kind(r, 'latency', 'scalability', 'throughput')).toBe(true) },
  { name: 'ML training batch', prompt: 'A batch ML training pipeline over large datasets.', check: (r) => expect(r.requirements.length).toBeGreaterThan(0) },
  { name: 'IoT ingestion', prompt: 'Ingest telemetry from 2 million IoT devices.', check: (r) => { expect(kind(r, 'throughput', 'scalability')).toBe(true); expect(re(r, /2m|million|device|2000000/i)).toBe(true); } },
  { name: 'static site CDN global', prompt: 'A marketing static site served globally with low latency.', check: (r) => expect(kind(r, 'latency', 'availability', 'scalability')).toBe(true) },
  { name: 'durable document store', prompt: 'A system that must never lose uploaded legal documents.', check: (r) => expect(kind(r, 'durability', 'compliance', 'security')).toBe(true) },
  { name: 'video streaming', prompt: 'A video-on-demand platform for a global audience.', check: (r) => expect(kind(r, 'availability', 'latency', 'scalability')).toBe(true) },
  { name: 'multi-tenant SaaS isolation', prompt: 'A multi-tenant SaaS requiring strong tenant data isolation.', check: (r) => expect(kind(r, 'security', 'compliance')).toBe(true) },
  { name: 'gaming backend', prompt: 'A multiplayer game backend with low-latency matchmaking.', check: (r) => expect(kind(r, 'latency', 'scalability')).toBe(true) },
  { name: 'social feed 50M MAU', prompt: 'A social feed with 50 million monthly active users.', check: (r) => { expect(kind(r, 'throughput', 'scalability')).toBe(true); expect(inferred(r)).toBe(true); } },
  { name: 'disaster recovery DR', prompt: 'An order system requiring cross-region disaster recovery.', check: (r) => expect(kind(r, 'availability', 'rpo_rto', 'durability')).toBe(true) },
  { name: 'small internal tool', prompt: 'A small internal admin dashboard for a team of 20.', check: (r) => { expect(r.requirements.length).toBeGreaterThan(0); expect(re(r, /50m|million|1000000/i)).toBe(false); } },
  { name: 'search service', prompt: 'A full-text product search service over a large catalog.', check: (r) => expect(kind(r, 'latency', 'scalability', 'throughput')).toBe(true) },
  { name: 'secrets-heavy integration', prompt: 'A service integrating many third-party APIs with secret credentials.', check: (r) => expect(kind(r, 'security')).toBe(true) },
  { name: 'observability-critical', prompt: 'A mission-critical payments service where downtime is unacceptable.', check: (r) => expect(kind(r, 'availability', 'security', 'compliance')).toBe(true) },
];

describe.skipIf(!LIVE)('Stage-E golden suite (live)', () => {
  const system = (): string => getPrompt(loadPromptRegistry(promptsDir), 'requirements').system;
  it.each(GOLDEN_CASES)('$name', async ({ prompt, check }) => {
    const r = await runRequirements({ prompt }, { client: anthropic(), model: resolveModel('mid'), system: system() });
    check(r);
  }, 60_000);
});

describe('golden suite', () => {
  it('covers ≥ 30 cases across workload classes', () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(30);
  });
});
