import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import type { CamlDocument, CamlError, ValidationResult } from '@cac/caml';
import type { Catalog, CatalogService, Provider } from './types.js';
import { groupServiceKey } from './loader.js';

const Ajv2020 = Ajv2020Import.default;
const addFormats = addFormatsImport.default;

// Pass-2 property fragments carry annotation keywords (costDimension,
// securityRelevant, default, description) the standard meta-schema does not know,
// so this Ajv is non-strict. additionalProperties stays open: the catalog schema
// is the abstract-merged-with-service view and is not exhaustive yet.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new WeakMap<CatalogService, ValidateFunction>();
function propsValidator(svc: CatalogService): ValidateFunction {
  let validate = validatorCache.get(svc);
  if (!validate) {
    validate = ajv.compile({
      type: 'object',
      properties: svc.properties ?? {},
      additionalProperties: true,
    });
    validatorCache.set(svc, validate);
  }
  return validate;
}

/** A component's abstract type is compatible with a service if either is the other (or a dotted ancestor). */
function typeCompatible(componentType: string, abstractTypes: string[]): boolean {
  return abstractTypes.some(
    (t) =>
      t === componentType ||
      t.startsWith(`${componentType}.`) ||
      componentType.startsWith(`${t}.`),
  );
}

/**
 * Pass 2 of the validation pipeline (blueprint doc 05): component and group
 * properties checked against the bound catalog service's schema. Components with
 * no binding and groups with no concrete service (e.g. a `region`) are skipped.
 * Pass 1 (structural) must pass first; this assumes a well-formed document.
 */
export function validateAgainstCatalog(doc: CamlDocument, catalog: Catalog): ValidationResult {
  const errors: CamlError[] = [];

  (doc.components ?? []).forEach((component, i) => {
    if (!component.binding) return; // abstract-only: capability-schema check deferred
    const svc = catalog.servicesByKey.get(component.binding.service);
    if (!svc) {
      errors.push({
        code: 'unknown-service',
        path: `components[${i}].binding.service`,
        element: component.id,
        message: `component "${component.id}": service "${component.binding.service}" is not in the catalog`,
      });
      return;
    }
    if (svc.abstractTypes && !typeCompatible(component.type, svc.abstractTypes)) {
      errors.push({
        code: 'type-mismatch',
        path: `components[${i}].type`,
        element: component.id,
        message: `component "${component.id}": type "${component.type}" is not compatible with ${svc.key} (expects ${svc.abstractTypes.join(' | ')})`,
      });
    }
    checkProps(svc, component.properties, `components[${i}]`, component.id, errors);
  });

  (doc.groups ?? []).forEach((group, i) => {
    const provider = resolveGroupProvider(doc, group);
    if (!provider) return;
    const svc = catalog.groupServicesByProviderKind.get(groupServiceKey(provider, group.kind));
    if (!svc) return; // logical grouping with no concrete service (e.g. region)
    checkProps(svc, group.properties, `groups[${i}]`, group.id, errors);
  });

  return { valid: errors.length === 0, errors };
}

function checkProps(
  svc: CatalogService,
  props: Record<string, unknown> | undefined,
  basePath: string,
  elementId: string,
  errors: CamlError[],
): void {
  const validate = propsValidator(svc);
  if (validate(props ?? {})) return;
  for (const e of validate.errors ?? []) {
    const propPath = e.instancePath.replace(/^\//, '').replace(/\//g, '.');
    const unknownProp =
      e.keyword === 'additionalProperties'
        ? (e.params as { additionalProperty?: string }).additionalProperty
        : undefined;
    const propName = propPath || unknownProp || '';
    const detail = unknownProp ? `is not a known property` : (e.message ?? 'is invalid');
    errors.push({
      code: 'catalog-property',
      path: `${basePath}.properties${propPath ? `.${propPath}` : ''}`,
      element: elementId,
      message: `${svc.key} "${elementId}": ${propName ? `property "${propName}" ` : ''}${detail}`,
    });
  }
}

/** A group's effective provider: its own, else the nearest ancestor's. */
function resolveGroupProvider(
  doc: CamlDocument,
  group: { id: string; provider?: Provider; parent?: string },
): Provider | undefined {
  const byId = new Map((doc.groups ?? []).map((g) => [g.id, g]));
  let current: { id: string; provider?: Provider; parent?: string } | undefined = group;
  const seen = new Set<string>();
  while (current) {
    if (current.provider) return current.provider;
    if (current.parent === undefined || seen.has(current.id)) break;
    seen.add(current.id);
    current = byId.get(current.parent);
  }
  return undefined;
}
