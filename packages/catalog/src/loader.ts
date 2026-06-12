import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import type { Catalog, CatalogService } from './types.js';

// ajv/ajv-formats are CJS — under NodeNext ESM the callables are on `.default`.
const Ajv2020 = Ajv2020Import.default;
const addFormats = addFormatsImport.default;

/** Raised when the catalog content fails to load or validate against the format schema. */
export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

/** Lookup key for a group-kind service: a group's effective provider + its kind. */
export function groupServiceKey(provider: string, kind: string): string {
  return `${provider}/${kind}`;
}

/**
 * Load and validate a catalog content directory (`catalog/` at the repo root):
 * `catalog-service.schema.json` (the format schema) + the `services` tree of
 * `*.yaml` files (e.g. `services/aws/rds.yaml`).
 * Every file is validated against the format schema; duplicate keys and
 * provider/key mismatches are rejected. Throws {@link CatalogError} on any problem.
 */
export function loadCatalog(rootDir: string): Catalog {
  const schemaPath = path.join(rootDir, 'catalog-service.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
  // strictRequired off: the oneOf branches use `required` to express
  // "exactly one of abstractTypes / groupKind" without restating properties.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  const validateService = ajv.compile(schema);

  const servicesDir = path.join(rootDir, 'services');
  const files = readdirSync(servicesDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  const servicesByKey = new Map<string, CatalogService>();
  const groupServicesByProviderKind = new Map<string, CatalogService>();

  for (const rel of files) {
    const full = path.join(servicesDir, rel);
    let parsed: unknown;
    try {
      parsed = parseYaml(readFileSync(full, 'utf8'));
    } catch (err) {
      throw new CatalogError(`${rel}: YAML parse error: ${(err as Error).message}`);
    }

    if (!validateService(parsed)) {
      const detail = (validateService.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message}`)
        .join('; ');
      throw new CatalogError(`${rel}: invalid catalog service: ${detail}`);
    }

    const svc = parsed as CatalogService;
    if (!svc.key.startsWith(`${svc.provider}.`)) {
      throw new CatalogError(`${rel}: key "${svc.key}" does not match provider "${svc.provider}"`);
    }
    if (servicesByKey.has(svc.key)) {
      throw new CatalogError(`${rel}: duplicate service key "${svc.key}"`);
    }
    servicesByKey.set(svc.key, svc);

    if (svc.groupKind) {
      const gk = groupServiceKey(svc.provider, svc.groupKind);
      if (groupServicesByProviderKind.has(gk)) {
        throw new CatalogError(`${rel}: duplicate group service for "${gk}"`);
      }
      groupServicesByProviderKind.set(gk, svc);
    }
  }

  return { servicesByKey, groupServicesByProviderKind };
}
