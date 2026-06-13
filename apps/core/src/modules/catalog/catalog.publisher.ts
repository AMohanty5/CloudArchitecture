import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { Catalog, CatalogService } from '@cac/catalog';
import { PG_POOL } from '../../database/database.module';
import { REDIS } from '../../redis/redis.module';
import { CATALOG } from './catalog.tokens';
import { CATALOG_INDEX_KEY, CATALOG_VERSION } from './constants';

/**
 * Publish-on-boot (doc 03 §3.6): mirror the catalog-as-code content (already
 * loaded into CATALOG) into Postgres (durable store) and Redis (palette cache).
 * Failures are logged, not fatal — reads fall back through Postgres to memory.
 */
@Injectable()
export class CatalogPublisher implements OnApplicationBootstrap {
  private readonly logger = new Logger('catalog-publish');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CATALOG) private readonly catalog: Catalog,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const services = [...this.catalog.servicesByKey.values()];
    let pg = false;
    let cache = false;
    try {
      await this.publishToPostgres(services);
      pg = true;
    } catch (err) {
      this.logger.warn(`Postgres publish skipped: ${(err as Error).message}`);
    }
    try {
      await this.redis.set(CATALOG_INDEX_KEY, JSON.stringify(services));
      cache = true;
    } catch (err) {
      this.logger.warn(`Redis publish skipped: ${(err as Error).message}`);
    }
    this.logger.log(`published ${services.length} catalog services (v=${CATALOG_VERSION}, postgres=${pg}, redis=${cache})`);
  }

  private async publishToPostgres(services: CatalogService[]): Promise<void> {
    for (const s of services) {
      await this.pool.query(
        `INSERT INTO catalog_services
           (version, key, provider, name, description, status, icon, docs, abstract_types, group_kind, capabilities, properties, connection_rules, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
         ON CONFLICT (version, key) DO UPDATE SET
           provider = EXCLUDED.provider, name = EXCLUDED.name, description = EXCLUDED.description,
           status = EXCLUDED.status, icon = EXCLUDED.icon, docs = EXCLUDED.docs,
           abstract_types = EXCLUDED.abstract_types, group_kind = EXCLUDED.group_kind,
           capabilities = EXCLUDED.capabilities, properties = EXCLUDED.properties,
           connection_rules = EXCLUDED.connection_rules, published_at = now()`,
        [
          CATALOG_VERSION,
          s.key,
          s.provider,
          s.name,
          s.description ?? null,
          s.status,
          s.icon ?? null,
          s.docs ?? null,
          s.abstractTypes ?? [],
          s.groupKind ?? null,
          s.capabilities ?? {},
          s.properties ?? {},
          s.connectionRules ?? {},
        ],
      );
    }
  }
}
