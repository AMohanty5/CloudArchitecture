/**
 * Connection-rule lint (blueprint doc 14, Day 48). Static hygiene checks over a loaded
 * catalog's `connectionRules`, catching the two failure modes that silently break the
 * canvas's drag-time connection affordances:
 *
 *  - `dangling-target`: a rule references an abstract type that NO service in the catalog
 *    can satisfy (and that isn't the `external` sentinel or a `group.<kind>` token). The
 *    rule can never match, so the intended connection is dead. Usually a typo or a type
 *    renamed out from under the rule.
 *  - `redundant-subtype`: a `from`/`to` list names both a parent type and one of its
 *    descendants. Subtype descent (typeMatches) already covers the descendant, so it is
 *    dead weight — flagged for cleanup, not correctness.
 *
 * Pure + deterministic: findings are sorted by (service, direction, code).
 */
import type { Catalog, CatalogService, ConnectionRule } from './types.js';

export interface LintFinding {
  severity: 'error' | 'warning';
  code: 'dangling-target' | 'redundant-subtype';
  service: string;
  direction: 'inbound' | 'outbound';
  message: string;
}

/** The `external` actor (off-diagram clients) is always a legal endpoint. */
const EXTERNAL = 'external';

/** `compute.vm` matches `compute.vm` and any `compute.vm.*` descendant (one-directional). */
function descendsFrom(type: string, ancestor: string): boolean {
  return type === ancestor || type.startsWith(`${ancestor}.`);
}

/** Every concrete endpoint type the catalog can actually materialize. */
function providableTypes(catalog: Catalog): Set<string> {
  const types = new Set<string>();
  for (const svc of catalog.servicesByKey.values()) {
    for (const t of svc.abstractTypes ?? []) types.add(t);
    if (svc.groupKind) types.add(`group.${svc.groupKind}`);
  }
  return types;
}

/** A rule target `ref` is live if some providable type equals it or descends from it. */
function isLive(ref: string, providable: Set<string>): boolean {
  if (ref === EXTERNAL) return true;
  for (const p of providable) if (descendsFrom(p, ref)) return true;
  return false;
}

function lintRule(
  rule: ConnectionRule,
  direction: 'inbound' | 'outbound',
  svc: CatalogService,
  providable: Set<string>,
  out: LintFinding[],
): void {
  const refs = (direction === 'inbound' ? rule.from : rule.to) ?? [];
  for (const ref of refs) {
    if (!isLive(ref, providable)) {
      out.push({
        severity: 'error',
        code: 'dangling-target',
        service: svc.key,
        direction,
        message: `${svc.key} ${direction} rule references "${ref}", which no catalog service provides`,
      });
    }
  }
  // Descendant listed alongside an ancestor it's already covered by.
  for (const ref of refs) {
    const ancestor = refs.find((other) => other !== ref && descendsFrom(ref, other));
    if (ancestor) {
      out.push({
        severity: 'warning',
        code: 'redundant-subtype',
        service: svc.key,
        direction,
        message: `${svc.key} ${direction} lists "${ref}" but "${ancestor}" already covers it via subtype descent`,
      });
    }
  }
}

/** Lint every service's connection rules. Returns findings sorted deterministically. */
export function lintConnectionRules(catalog: Catalog): LintFinding[] {
  const providable = providableTypes(catalog);
  const findings: LintFinding[] = [];
  for (const svc of catalog.servicesByKey.values()) {
    for (const rule of svc.connectionRules?.inbound ?? []) lintRule(rule, 'inbound', svc, providable, findings);
    for (const rule of svc.connectionRules?.outbound ?? []) lintRule(rule, 'outbound', svc, providable, findings);
  }
  findings.sort(
    (a, b) =>
      a.service.localeCompare(b.service) || a.direction.localeCompare(b.direction) || a.code.localeCompare(b.code),
  );
  return findings;
}
