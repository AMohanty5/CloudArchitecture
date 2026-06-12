import { Pool } from 'pg';
import { loadConfig } from '../config/config';
import { runMigrations } from './migrate';

/** Standalone migration entrypoint: `pnpm --filter @cac/core migrate`. */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  try {
    const ran = await runMigrations(pool);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
