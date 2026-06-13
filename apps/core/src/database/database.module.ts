import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DEFAULT_TENANT_ID, loadConfig } from '../config/config';

/** DI token for the shared pg connection pool. */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Provides the Postgres connection pool app-wide. Every pooled connection runs
 * `SET app.tenant_id` to the single-tenant default so the RLS policies installed
 * by the first migration (doc 04) evaluate against a real tenant.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool =>
        // Set the tenant GUC at session start (server `options`) — no per-connect
        // query, so no races and no "already executing" deprecation warning.
        new Pool({
          connectionString: loadConfig().databaseUrl,
          max: 10,
          options: `-c app.tenant_id=${DEFAULT_TENANT_ID}`,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
