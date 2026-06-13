import path from 'node:path';

/** Runtime configuration, read from the environment with local-dev defaults. */
export interface CoreConfig {
  port: number;
  databaseUrl: string;
  /** Catalog-as-code content dir (repo `catalog/`). */
  catalogDir: string;
}

export function loadConfig(): CoreConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://cac:cac@localhost:5432/cac',
    // From apps/core (cwd at runtime + during tests) the repo catalog/ is two up.
    catalogDir: process.env.CATALOG_DIR ?? path.resolve(process.cwd(), '../../catalog'),
  };
}

/**
 * Single-tenant default while tenancy/auth is deferred to Stage F (build plan).
 * Every tenant-scoped row defaults to this and the DB pool runs as this tenant so
 * RLS policies (doc 04) evaluate — they only bite once the app uses a non-owner role.
 */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** Single-tenant placeholders for NOT NULL columns until workspace/identity exist (Stage F). */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';
