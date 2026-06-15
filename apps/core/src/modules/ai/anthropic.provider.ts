import Anthropic from '@anthropic-ai/sdk';
import type { ModelTier } from './prompt-registry';

/**
 * Provider abstraction for the AI pipeline (blueprint doc 07 model strategy). Resolves a
 * prompt's model tier to a concrete Claude model, exposes per-model pricing for token
 * accounting, and lazily constructs the Anthropic client. Generation itself is stubbed on
 * Day 30 — this wiring is what the real Composer/Critic days call into. Default model is
 * Claude Opus 4.8 for the frontier tier.
 */

/** Tier → concrete model id (doc 07: frontier=Opus, mid=Sonnet, small=Haiku). */
export const MODEL_BY_TIER: Record<ModelTier, string> = {
  frontier: 'claude-opus-4-8',
  mid: 'claude-sonnet-4-6',
  small: 'claude-haiku-4-5',
};

/** USD per 1M tokens (input, output) per model — drives per-job cost accounting. */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function resolveModel(tier: ModelTier): string {
  return MODEL_BY_TIER[tier];
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK['claude-opus-4-8']!;
  const usd = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(usd * 10_000) / 10_000;
}

let client: Anthropic | undefined;

/**
 * Lazily construct the shared Anthropic client. Reads ANTHROPIC_API_KEY from the
 * environment; throws only when actually invoked without a key — so the Day-30 stub
 * pipeline (which never calls the model) runs with no key configured.
 */
export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set — live generation is not configured.');
    }
    client = new Anthropic();
  }
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
