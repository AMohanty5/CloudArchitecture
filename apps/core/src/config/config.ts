/** Runtime configuration, read from the environment with local-dev defaults. */
export interface CoreConfig {
  port: number;
  databaseUrl: string;
}

export function loadConfig(): CoreConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://cac:cac@localhost:5432/cac',
  };
}

/**
 * Single-tenant default while tenancy/auth is deferred to Stage F (build plan).
 * Every tenant-scoped row defaults to this and the DB pool runs as this tenant so
 * RLS policies (doc 04) evaluate — they only bite once the app uses a non-owner role.
 */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
