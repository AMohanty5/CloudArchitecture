/**
 * @cac/catalog — catalog-as-code loader + pass-2 validation (blueprint docs 05, 14).
 *
 * Loads the versioned `catalog/` content (service definitions authored as YAML,
 * validated against the catalog format schema) and validates CAML component/group
 * properties against the bound service's schema — the second pass of the 3-pass
 * pipeline (pass 1 = structural, in @cac/caml; pass 3 = semantic rules, later).
 */
export { loadCatalog, CatalogError, groupServiceKey } from './loader.js';
export { validateAgainstCatalog } from './validate.js';
export { lintConnectionRules } from './lint.js';
export type { LintFinding } from './lint.js';
export type { Catalog, CatalogService, ConnectionRule, ConnectionKnowledge, AntiPattern, Provider } from './types.js';
