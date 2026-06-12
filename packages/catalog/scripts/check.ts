/**
 * Catalog lint: load and validate the repo `catalog/` content against the format
 * schema, then print a summary. Exits non-zero on any problem (CI gate).
 *   pnpm --filter @cac/catalog check
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, CatalogError } from '../src/loader.js';

const catalogRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');

try {
  const catalog = loadCatalog(catalogRoot);
  const keys = [...catalog.servicesByKey.keys()].sort();
  console.log(`✓ catalog OK — ${keys.length} service(s):`);
  for (const key of keys) {
    const svc = catalog.servicesByKey.get(key)!;
    const target = svc.groupKind ? `group:${svc.groupKind}` : (svc.abstractTypes ?? []).join(',');
    console.log(`  - ${key.padEnd(16)} ${svc.status.padEnd(8)} ${target}`);
  }
} catch (err) {
  if (err instanceof CatalogError) {
    console.error(`✗ catalog invalid: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
