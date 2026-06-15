import { describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { GenerationService } from './generation.service';
import type { AiEvent, StageEvent } from './types';

describe('GenerationService (stubbed pipeline)', () => {
  it('streams the full pipeline shape and a usage + done event', async () => {
    const service = new GenerationService();
    const { jobId } = service.createJob({ prompt: 'A highly available e-commerce platform on AWS' });
    const events = await firstValueFrom(service.stream(jobId).pipe(toArray()));
    const aiEvents = events.map((e) => e.data);

    // Every pipeline stage starts and completes, in order (doc 07 topology).
    const completed = aiEvents.filter((e): e is StageEvent => e.type === 'stage' && e.status === 'completed');
    expect(completed.map((e) => e.stage)).toEqual(['router', 'requirements', 'planner', 'composer', 'critic', 'repair']);

    const usage = aiEvents.find((e) => e.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.estCostUsd).toBeGreaterThan(0);
    }

    const done = aiEvents.at(-1) as AiEvent;
    expect(done.type).toBe('done');
    if (done.type === 'done') expect(done.branch).toMatch(/^ai\/gen-/);
  });

  it('resolves the composer/critic stages to the frontier model', async () => {
    const service = new GenerationService();
    const { jobId } = service.createJob({ prompt: 'x' });
    const events = await firstValueFrom(service.stream(jobId).pipe(toArray()));
    const composer = events.map((e) => e.data).find((e): e is StageEvent => e.type === 'stage' && e.stage === 'composer');
    expect(composer?.model).toBe('claude-opus-4-8');
  });

  it('404s an unknown job', () => {
    expect(() => new GenerationService().stream('nope')).toThrow();
  });
});
