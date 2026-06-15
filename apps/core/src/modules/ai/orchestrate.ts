import type { CamlDocument, Requirement } from '@cac/caml';
import type { AnthropicLike } from './requirements.agent';
import { runCritic } from './critic.agent';
import type { CriticFinding } from './critic.agent';
import { runRepair } from './repair.agent';

/**
 * The closed review loop (blueprint doc 07 / doc 17 orchestrator contract): composer →
 * critic; on `revise`, repair → critic again, up to N iterations. Each critic pass calls
 * the deterministic validation engine (ground truth) inside the agent. Unresolved findings
 * after the budget are returned as `remainingFindings` (they become proposal annotations).
 */

export interface ReviewResult {
  finalModel: CamlDocument;
  initialFindings: CriticFinding[];
  remainingFindings: CriticFinding[];
  repairs: number;
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function orchestrateReview(
  input: { model: CamlDocument; requirements: Requirement[] },
  deps: { client: AnthropicLike; model: string; criticSystem: string; repairSystem: string; maxIterations?: number },
): Promise<ReviewResult> {
  const maxIters = deps.maxIterations ?? 3;
  let model = input.model;
  let initialFindings: CriticFinding[] = [];
  let remainingFindings: CriticFinding[] = [];
  let repairs = 0;
  let iterations = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < maxIters; i++) {
    iterations++;
    const critic = await runCritic(
      { target: model, requirements: input.requirements },
      { client: deps.client, model: deps.model, system: deps.criticSystem },
    );
    inputTokens += critic.usage.inputTokens;
    outputTokens += critic.usage.outputTokens;
    if (i === 0) initialFindings = critic.findings;
    remainingFindings = critic.findings;
    if (critic.verdict === 'pass' || critic.findings.length === 0) break;

    const repair = await runRepair(
      { model, findings: critic.findings },
      { client: deps.client, model: deps.model, system: deps.repairSystem },
    );
    inputTokens += repair.usage.inputTokens;
    outputTokens += repair.usage.outputTokens;
    if (!repair.applied) break; // nothing changed — further critic rounds won't help
    model = repair.model;
    repairs++;
  }

  return { finalModel: model, initialFindings, remainingFindings, repairs, iterations, usage: { inputTokens, outputTokens } };
}
