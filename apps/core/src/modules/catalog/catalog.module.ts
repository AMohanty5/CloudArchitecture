import { Global, Module } from '@nestjs/common';
import { loadCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { loadConfig } from '../../config/config';

/** DI token for the loaded, validated catalog (blueprint doc 14). */
export const CATALOG = Symbol('CATALOG');

/**
 * Catalog Service — loads the catalog-as-code content once at boot and serves it
 * to validation (pass 2) and, from Day 10, the palette endpoints + Redis cache.
 * Global so any module can inject CATALOG. Depend on this only via `./api`.
 */
@Global()
@Module({
  providers: [{ provide: CATALOG, useFactory: (): Catalog => loadCatalog(loadConfig().catalogDir) }],
  exports: [CATALOG],
})
export class CatalogModule {}
