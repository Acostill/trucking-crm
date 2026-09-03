import fs from 'fs';
import path from 'path';
import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '018_phase1_hardening.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '018_phase1_hardening.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '018_phase1_hardening.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) throw new Error('Unable to find 018_phase1_hardening.sql');
  const expectedEnvironment = databaseEnvironment();
  if (expectedEnvironment === 'unlabeled' || expectedEnvironment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before migrating');
  }
  await db.query(fs.readFileSync(migrationPath, 'utf8'));
  const labelResult = await db.query(
    `INSERT INTO public.application_environment (singleton, environment)
     VALUES (TRUE, $1)
     ON CONFLICT (singleton) DO NOTHING
     RETURNING environment`,
    [expectedEnvironment]
  );
  const storedEnvironment = labelResult.rows[0]
    ? labelResult.rows[0].environment
    : (await db.query(
      `SELECT environment FROM public.application_environment WHERE singleton = TRUE`
    )).rows[0]?.environment;
  if (storedEnvironment !== expectedEnvironment) {
    throw new Error(
      `Database identity mismatch: expected ${expectedEnvironment}, found ${storedEnvironment || 'missing'}`
    );
  }
  const result = await db.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'loads' AND column_name = 'source_quote_id'
       ) AS source_quote_ready,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'public_access_token_hash'
       ) AS quote_token_ready,
       to_regclass('public.dat_worker_heartbeats') IS NOT NULL AS worker_health_ready,
       (SELECT environment FROM public.application_environment WHERE singleton = TRUE) AS database_environment`
  );
  console.log('Phase 1 hardening migration:', result.rows[0]);
}

run()
  .catch(function(err) {
    console.error('Phase 1 hardening migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
