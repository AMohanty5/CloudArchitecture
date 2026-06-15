import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReplaySubject } from 'rxjs';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { loadConfig } from '../../config/config';
import { loadPromptRegistry } from './prompt-registry';
import type { ModelTier, PromptRegistry } from './prompt-registry';
import { anthropic, estimateCostUsd, hasApiKey, resolveModel } from './anthropic.provider';
import { runRequirements } from './requirements.agent';
import type { RequirementsResult } from './requirements.agent';
import { runPlanner, unmappedRequirementIds } from './planner.agent';
import { loadPatterns } from './pattern-store';
import type { PatternStore } from './pattern-store';
import type { AiEvent, AiStage, GenerateInput } from './types';

interface Job {
  events: ReplaySubject<AiEvent>;
}

/** One scripted pipeline step (doc 07 topology). `promptId` ties it to a registry spec. */
interface StubStage {
  stage: AiStage;
  promptId?: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  detail: string;
  delayMs: number;
}

const PIPELINE: StubStage[] = [
  { stage: 'router', tier: 'small', inputTokens: 220, outputTokens: 40, detail: 'intent classified: generate', delayMs: 250 },
  { stage: 'requirements', promptId: 'requirements', tier: 'mid', inputTokens: 1300, outputTokens: 820, detail: 'extracted 4 requirements, inferred 3 (PCI, RPO≤5m, ~30k RPS)', delayMs: 500 },
  { stage: 'planner', promptId: 'planner', tier: 'frontier', inputTokens: 3100, outputTokens: 1500, detail: 'composed 2 reference patterns; mapped every requirement', delayMs: 600 },
  { stage: 'composer', promptId: 'composer', tier: 'frontier', inputTokens: 8200, outputTokens: 4100, detail: 'emitted CAML: 4 groups, 6 components, 7 connections', delayMs: 800 },
  { stage: 'critic', promptId: 'critic', tier: 'frontier', inputTokens: 6400, outputTokens: 1250, detail: 'ran validation: 1 finding (SEC-002); requirements satisfied', delayMs: 600 },
  { stage: 'repair', promptId: 'repair', tier: 'frontier', inputTokens: 4300, outputTokens: 1500, detail: 'addressed 1 finding; 0 deferred', delayMs: 500 },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * AI generation jobs (blueprint doc 07). Day 30 is a scaffold: the orchestrator runs the
 * real pipeline *shape* (router → requirements → planner → composer → critic → repair)
 * and streams stage + token-accounting events, but the stages are **stubbed** — no model
 * is called yet (the Anthropic provider + prompt registry are wired for the Composer day).
 * Jobs are in-memory; a ReplaySubject buffers events so a late SSE subscriber sees the
 * whole run.
 */
@Injectable()
export class GenerationService {
  private readonly log = new Logger(GenerationService.name);
  private readonly registry: PromptRegistry;
  private readonly patterns: PatternStore;
  private readonly jobs = new Map<string, Job>();

  constructor() {
    const config = loadConfig();
    let registry: PromptRegistry = { byId: new Map() };
    try {
      registry = loadPromptRegistry(config.aiPromptsDir);
    } catch (err) {
      this.log.warn(`prompt registry not loaded: ${(err as Error).message}`);
    }
    this.registry = registry;
    let patterns: PatternStore = [];
    try {
      patterns = loadPatterns(config.aiPatternsDir);
    } catch (err) {
      this.log.warn(`pattern corpus not loaded: ${(err as Error).message}`);
    }
    this.patterns = patterns;
  }

  /** Start a (stubbed) generation job; returns its id. The run streams asynchronously. */
  createJob(input: GenerateInput): { jobId: string } {
    const jobId = randomUUID();
    const events = new ReplaySubject<AiEvent>();
    this.jobs.set(jobId, { events });
    void this.run(input, events);
    return { jobId };
  }

  /** The production system prompt for an agent, or '' if the registry didn't load. */
  private systemFor(id: string): string {
    return this.registry.byId.get(id)?.system ?? '';
  }

  /** SSE stream of a job's events (replays from the start for late subscribers). */
  stream(jobId: string): Observable<{ data: AiEvent }> {
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException(`job ${jobId} not found`);
    return job.events.asObservable().pipe(map((event) => ({ data: event })));
  }

  private async run(input: GenerateInput, events: ReplaySubject<AiEvent>): Promise<void> {
    try {
      let inputTokens = 0;
      let outputTokens = 0;
      let requirements: RequirementsResult | undefined;
      const keyed = hasApiKey();
      for (const step of PIPELINE) {
        const tier = this.registry.byId.get(step.promptId ?? '')?.modelTier ?? step.tier;
        const model = resolveModel(tier);
        events.next({ type: 'stage', stage: step.stage, status: 'started', promptId: step.promptId, model });

        let detail = step.detail;
        let stepIn = step.inputTokens;
        let stepOut = step.outputTokens;
        // Real stages when an API key is configured: requirements (Day 31) feeds the
        // planner (Day 32); every other stage is still stubbed. Failures degrade to the stub.
        if (step.stage === 'requirements' && keyed) {
          try {
            const result = await runRequirements({ prompt: input.prompt }, { client: anthropic(), model, system: this.systemFor('requirements') });
            requirements = result;
            const inferred = result.requirements.filter((r) => r.source === 'inferred').length;
            detail =
              `extracted ${result.requirements.length} requirements (${inferred} inferred)` +
              (result.ambiguities.length ? `; ${result.ambiguities.length} to confirm` : '');
            stepIn = result.usage.inputTokens;
            stepOut = result.usage.outputTokens;
          } catch (err) {
            detail = `${step.detail} (live model unavailable: ${(err as Error).message})`;
          }
        } else if (step.stage === 'planner' && keyed && requirements) {
          try {
            const plan = await runPlanner(
              { requirements: requirements.requirements, provider: input.provider },
              { client: anthropic(), model, system: this.systemFor('planner'), patterns: this.patterns },
            );
            const unmapped = unmappedRequirementIds(plan, requirements.requirements).length;
            detail =
              `planned ${plan.capabilityNeeds.length} capabilities from ${plan.patternCitations.length} pattern(s)` +
              (unmapped ? `; ${unmapped} requirement(s) unmapped` : '; every requirement mapped');
            stepIn = plan.usage.inputTokens;
            stepOut = plan.usage.outputTokens;
          } catch (err) {
            detail = `${step.detail} (live model unavailable: ${(err as Error).message})`;
          }
        } else {
          await sleep(step.delayMs);
        }

        inputTokens += stepIn;
        outputTokens += stepOut;
        events.next({
          type: 'stage',
          stage: step.stage,
          status: 'completed',
          promptId: step.promptId,
          model,
          detail,
          inputTokens: stepIn,
          outputTokens: stepOut,
        });
      }
      // Frontier pricing drives the headline cost (the composer/critic/repair dominate).
      events.next({
        type: 'usage',
        inputTokens,
        outputTokens,
        estCostUsd: estimateCostUsd(resolveModel('frontier'), inputTokens, outputTokens),
      });
      events.next({
        type: 'done',
        branch: `ai/gen-${randomUUID().slice(0, 8)}`,
        message: `Proposal ready for "${input.prompt.slice(0, 60)}" — review the diff and merge.`,
      });
    } catch (err) {
      events.next({ type: 'error', message: (err as Error).message });
    } finally {
      events.complete();
    }
  }
}
