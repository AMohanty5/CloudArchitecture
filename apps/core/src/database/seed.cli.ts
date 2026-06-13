import { Pool } from 'pg';
import { loadCatalog } from '@cac/catalog';
import { DEFAULT_TENANT_ID, loadConfig } from '../config/config';
import { seedDatabase } from '../modules/architecture/api';

/** Load demo/test fixture architectures: `pnpm --filter @cac/core seed`. Rerunnable. */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    options: `-c app.tenant_id=${DEFAULT_TENANT_ID}`,
  });
  try {
    const seeded = await seedDatabase(pool, loadCatalog(config.catalogDir));
    console.log(`Seeded ${seeded.length} architectures:`);
    for (const s of seeded) console.log(`  - ${s.name} (${s.commits.length} commits)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
