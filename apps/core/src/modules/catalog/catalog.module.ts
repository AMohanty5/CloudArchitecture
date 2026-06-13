import { Global, Module } from '@nestjs/common';
import { loadCatalog } from '@cac/catalog';
import type { Catalog } from '@cac/catalog';
import { loadConfig } from '../../config/config';
import { CATALOG } from './catalog.tokens';
import { CatalogController } from './catalog.controller';
import { CatalogPublisher } from './catalog.publisher';
import { CatalogQueryService } from './catalog-query.service';

/**
 * Catalog Service — loads the catalog-as-code content once at boot (CATALOG),
 * publishes it to Postgres + Redis (CatalogPublisher), and serves palette search
 * + service detail (CatalogQueryService). Used by validation (pass 2) and the
 * canvas palette. Global so any module can inject CATALOG. Depend via `./api`.
 */
@Global()
@Module({
  controllers: [CatalogController],
  providers: [
    { provide: CATALOG, useFactory: (): Catalog => loadCatalog(loadConfig().catalogDir) },
    CatalogPublisher,
    CatalogQueryService,
  ],
  exports: [CATALOG],
})
export class CatalogModule {}
