/** Provider identifiers, aligned with CAML's `binding.provider`. */
export type Provider = 'aws' | 'azure' | 'gcp' | 'generic';

/** A legal-connection rule (drives canvas affordances + later structural validation). */
export interface ConnectionRule {
  kinds: string[];
  protocols?: string[];
  from?: string[];
  to?: string[];
}

/** A discouraged-but-legal target (advisor anti-pattern, Phase 3B). */
export interface AntiPattern {
  to: string;
  reason: string;
}

/**
 * Architecture-intelligence metadata (Phase 3B, docs/architecture-intelligence.md §1):
 * curated guidance layered over the rules graph — what a service should connect to,
 * which intermediary bridges an indirect target, and which direct targets are anti-patterns.
 */
export interface ConnectionKnowledge {
  recommendedTargets?: string[];
  /** Target abstract type -> the intermediary types that bridge it. */
  requiresIntermediary?: Record<string, string[]>;
  antiPatterns?: AntiPattern[];
  /** Pattern-library ids (Day 105). */
  recommendedPatterns?: string[];
}

/**
 * One catalog-as-code service definition (blueprint doc 14). A service targets
 * EITHER component abstract types (`abstractTypes`) OR a CAML group kind
 * (`groupKind`). `properties` is a JSON-Schema fragment map consumed by pass-2
 * validation, the property form, IaC, and cost.
 */
export interface CatalogService {
  key: string;
  provider: Provider;
  name: string;
  description?: string;
  status: 'ga' | 'preview' | 'deprecated';
  icon?: string;
  docs?: string;
  abstractTypes?: string[];
  groupKind?: string;
  capabilities?: Record<string, unknown>;
  /** Property name -> JSON Schema fragment. */
  properties?: Record<string, Record<string, unknown>>;
  connectionRules?: { inbound?: ConnectionRule[]; outbound?: ConnectionRule[]; knowledge?: ConnectionKnowledge };
  /** Future fields (costDimensions, iac, equivalents, evalCases) are tolerated. */
  [extra: string]: unknown;
}

/** A loaded, validated catalog version with the lookups pass-2 and the palette need. */
export interface Catalog {
  /** By catalog key, e.g. `aws.rds`. */
  servicesByKey: ReadonlyMap<string, CatalogService>;
  /** By `${provider}/${groupKind}`, e.g. `aws/network` -> aws.vpc. */
  groupServicesByProviderKind: ReadonlyMap<string, CatalogService>;
}
