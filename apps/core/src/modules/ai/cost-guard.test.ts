import { afterEach, describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { GenerationService } from './generation.service';
import type { AiEvent, StageEvent } from './types';

/**
 * Cost guard (doc 07): the pipeline stops gracefully when a per-job token or wall-clock
 * budget is exceeded, returning whatever was produced. Exercised over the (keyless) stub
 * pipeline, whose stages carry fixed token costs — so a low budget halts it early.
 */
describe('GenerationService — cost guard', () => {
  const prevBudget = process.env.AI_TOKEN_BUDGET;
  const prevTimeout = process.env.AI_JOB_TIMEOUT_MS;
  afterEach(() => {
    process.env.AI_TOKEN_BUDGET = prevBudget;
    process.env.AI_JOB_TIMEOUT_MS = prevTimeout;
  });

  const completedStages = (events: AiEvent[]): string[] =>
    events.filter((e): e is StageEvent => e.type === 'stage' && e.status === 'completed').map((e) => e.stage);

  it('stops early and logs a partial result when the token budget is exceeded', async () => {
    process.env.AI_TOKEN_BUDGET = '5000'; // router+requirements ≈ 2.4k; planner pushes past 5k
    const svc = new GenerationService();
    const { jobId } = svc.createJob({ prompt: 'a web app' });
    const events = (await firstValueFrom(svc.stream(jobId).pipe(toArray()))).map((e) => e.data);

    const stages = completedStages(events);
    expect(stages.length).toBeLessThan(6); // did not run the whole pipeline
    expect(stages).toContain('requirements');
    expect(events.some((e) => e.type === 'log' && /token budget/.test(e.message))).toBe(true);
    // Still ends cleanly with usage + done (graceful, not an error).
    expect(events.some((e) => e.type === 'usage')).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') expect(done.message).toMatch(/Stopped early/);
  });

  it('runs the full pipeline under a generous budget', async () => {
    process.env.AI_TOKEN_BUDGET = '10000000';
    const svc = new GenerationService();
    const { jobId } = svc.createJob({ prompt: 'a web app' });
    const events = (await firstValueFrom(svc.stream(jobId).pipe(toArray()))).map((e) => e.data);
    expect(completedStages(events)).toHaveLength(6);
    expect(events.some((e) => e.type === 'log')).toBe(false);
  });
});
