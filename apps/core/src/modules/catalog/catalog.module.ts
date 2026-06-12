import { Module } from '@nestjs/common';

/**
 * Catalog Service — serves the cloud knowledge catalog (@cac/catalog) to the
 * palette and validation (blueprint doc 03 §3.6). Endpoints + Redis cache land
 * Day 10. Depend on this only via `./api`.
 */
@Module({})
export class CatalogModule {}
