import type { CamlDocument } from '@cac/caml';
import { runRules } from './engine';
import type { ValidationReport } from './engine';
import { PACK_VERSION, V1_PACK } from './pack';

/**
 * Run the baseline rule pack over a model (blueprint doc 16). The report is a pure
 * function of the model + pack version — cacheable per commit, recomputed only on
 * a new pack release.
 */
export function validateModel(model: CamlDocument): ValidationReport {
  return runRules(model, V1_PACK, PACK_VERSION);
}
