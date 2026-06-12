import type { Pool } from 'pg';
import { migrations } from './migrations';

/**
 * Apply pending migrations in order, each in its own transaction, tracked in
 * `schema_migrations`. Idempotent: a second run applies nothing. Returns the ids
 * applied this run.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id          TEXT PRIMARY KEY,
       applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const { rows } = await pool.query<{ id: string }>('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      await client.query('COMMIT');
      ran.push(migration.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return ran;
}
