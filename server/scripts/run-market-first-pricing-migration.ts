import fs from 'fs';
import path from 'path';
import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '022_market_first_pricing.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '022_market_first_pricing.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '022_market_first_pricing.sql')
];

async function run() {
  const migrationPath = candidates.find(function(candidate) { return fs.existsSync(candidate); });
  if (!migrationPath) throw new Error('Unable to find 022_market_first_pricing.sql');
  const environment = databaseEnvironment();
  if (environment === 'unlabeled' || environment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before migrating');
  }
  await db.query(fs.readFileSync(migrationPath, 'utf8'));
  const result = await db.query(
    `SELECT
       to_regclass('public.expedite_rate_rules') IS NOT NULL AS rate_table_ready,
       to_regclass('public.lane_rate_history') IS NOT NULL AS lane_history_ready,
       to_regclass('public.zip_centroids') IS NOT NULL AS zip_centroids_ready,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_quote_requests' AND column_name='truck_cost') AS truck_cost_ready`
  );
  console.log('Market-first pricing migration:', result.rows[0]);
}

run()
  .catch(function(error) {
    console.error('Market-first pricing migration failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async function() { await db.pool.end(); });
