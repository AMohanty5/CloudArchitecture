import type { CamlDocument } from '@cac/caml';
import type { Catalog, ConnectionKnowledge } from '@cac/catalog';
import { runRules } from './engine';
import type { ValidationReport } from './engine';
import { PACK_VERSION, V1_PACK, antiPatternRule } from './pack';

/**
 * Run the baseline rule pack over a model (blueprint doc 16). The report is a pure
 * function of the model + pack version — cacheable per commit, recomputed only on
 * a new pack release. When `knowledgeByService` is supplied (Phase 3B / Day 103) the
 * anti-pattern rule (ARC-001) is included; without it the pack is unchanged, so callers
 * with no catalog (e.g. the AI critic) keep working.
 */
export function validateModel(model: CamlDocument, knowledgeByService?: ReadonlyMap<string, ConnectionKnowledge>): ValidationReport {
  const rules = knowledgeByService ? [...V1_PACK, antiPatternRule(knowledgeByService)] : V1_PACK;
  return runRules(model, rules, PACK_VERSION);
}

/** Extract the per-service `knowledge` metadata from a loaded catalog (drives ARC-001). */
export function knowledgeByService(catalog: Catalog): Map<string, ConnectionKnowledge> {
  const map = new Map<string, ConnectionKnowledge>();
  for (const [key, svc] of catalog.servicesByKey) {
    const knowledge = svc.connectionRules?.knowledge;
    if (knowledge) map.set(key, knowledge);
  }
  return map;
}
