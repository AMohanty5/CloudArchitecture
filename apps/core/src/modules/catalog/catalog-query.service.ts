import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { Catalog, CatalogService } from '@cac/catalog';
import { PG_POOL } from '../../database/database.module';
import { REDIS } from '../../redis/redis.module';
import { CATALOG } from './catalog.tokens';
import { CATALOG_INDEX_KEY, CATALOG_VERSION } from './constants';
import { rankServices } from './ranking';

export interface ServiceSummary {
  key: string;
  name: string;
  provider: string;
  abstractTypes?: string[];
  groupKind?: string;
  status: string;
  iconUrl: string;
  score: number;
}

const iconUrl = (key: string): string => `/api/v1/catalog/icons/${key}`;

/**
 * Read side of the Catalog Service. Served from Redis (palette latency) with
 * fallback to Postgres (durable) and finally the in-memory catalog, so reads
 * work even before publish completes or if a store is briefly unavailable.
 */
@Injectable()
export class CatalogQueryService {
  private readonly logger = new Logger('catalog-query');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CATALOG) private readonly catalog: Catalog,
  ) {}

  async search(q?: string, provider?: string): Promise<ServiceSummary[]> {
    const services = await this.loadServices();
    return rankServices(services, { q, provider }).map(({ service, score }) => ({
      key: service.key,
      name: service.name,
      provider: service.provider,
      abstractTypes: service.abstractTypes,
      groupKind: service.groupKind,
      status: service.status,
      iconUrl: iconUrl(service.key),
      score,
    }));
  }

  /** Full service incl. the `properties` JSON Schema the property form consumes. */
  async getService(key: string): Promise<CatalogService & { iconUrl: string }> {
    const service = (await this.loadServices()).find((s) => s.key === key);
    if (!service) throw new NotFoundException(`catalog service "${key}" not found`);
    return { ...service, iconUrl: iconUrl(service.key) };
  }

  /** Like {@link getService} but returns undefined instead of throwing — used by the icon endpoint. */
  async tryGetService(key: string): Promise<CatalogService | undefined> {
    return (await this.loadServices()).find((s) => s.key === key);
  }

  /**
   * All services' connection rules keyed by catalog key (only those that declare any).
   * Lets the canvas prefetch every rule in one request so a just-dropped service is
   * connectable immediately, with no per-service drag-time fetch race (Day 52).
   */
  async getAllConnectionRules(): Promise<Record<string, CatalogService['connectionRules']>> {
    const out: Record<string, CatalogService['connectionRules']> = {};
    for (const s of await this.loadServices()) {
      if (s.connectionRules && (s.connectionRules.inbound?.length || s.connectionRules.outbound?.length)) {
        out[s.key] = s.connectionRules;
      }
    }
    return out;
  }

  private async loadServices(): Promise<CatalogService[]> {
    // 1. Redis index (hot path)
    try {
      const cached = await this.redis.get(CATALOG_INDEX_KEY);
      if (cached) return JSON.parse(cached) as CatalogService[];
    } catch (err) {
      this.logger.warn(`Redis read failed, falling back: ${(err as Error).message}`);
    }
    // 2. Postgres (durable)
    try {
      const services = await this.fromPostgres();
      if (services.length > 0) {
        await this.redis.set(CATALOG_INDEX_KEY, JSON.stringify(services)).catch(() => undefined);
        return services;
      }
    } catch (err) {
      this.logger.warn(`Postgres read failed, falling back: ${(err as Error).message}`);
    }
    // 3. In-memory catalog (always available)
    return [...this.catalog.servicesByKey.values()];
  }

  private async fromPostgres(): Promise<CatalogService[]> {
    const res = await this.pool.query<{
      key: string;
      provider: CatalogService['provider'];
      name: string;
      description: string | null;
      status: CatalogService['status'];
      icon: string | null;
      docs: string | null;
      abstract_types: string[];
      group_kind: string | null;
      capabilities: Record<string, unknown>;
      properties: Record<string, Record<string, unknown>>;
      connection_rules: CatalogService['connectionRules'];
    }>(
      `SELECT key, provider, name, description, status, icon, docs, abstract_types, group_kind, capabilities, properties, connection_rules
       FROM catalog_services WHERE version = $1 ORDER BY key`,
      [CATALOG_VERSION],
    );
    return res.rows.map((r) => ({
      key: r.key,
      provider: r.provider,
      name: r.name,
      description: r.description ?? undefined,
      status: r.status,
      icon: r.icon ?? undefined,
      docs: r.docs ?? undefined,
      abstractTypes: r.abstract_types.length > 0 ? r.abstract_types : undefined,
      groupKind: r.group_kind ?? undefined,
      capabilities: r.capabilities,
      properties: r.properties,
      connectionRules: r.connection_rules,
    }));
  }
}
