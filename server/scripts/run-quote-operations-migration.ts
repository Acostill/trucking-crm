import fs from 'fs';
import path from 'path';
import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '019_quote_operations.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '019_quote_operations.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '019_quote_operations.sql')
];

async function run() {
  const migrationPath = candidates.find(function(candidate) { return fs.existsSync(candidate); });
  if (!migrationPath) throw new Error('Unable to find 019_quote_operations.sql');
  const environment = databaseEnvironment();
  if (environment === 'unlabeled' || environment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before migrating');
  }
  await db.query(fs.readFileSync(migrationPath, 'utf8'));
  const result = await db.query(
    `SELECT
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_quote_requests' AND column_name='quote_outcome') AS outcomes_ready,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_quote_requests' AND column_name='advisor_acknowledged_at') AS advisor_ready`
  );
  console.log('Quote operations migration:', result.rows[0]);
}

run()
  .catch(function(error) {
    console.error('Quote operations migration failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async function() { await db.pool.end(); });
