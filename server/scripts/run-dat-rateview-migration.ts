import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '017_dat_rateview_jobs.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '017_dat_rateview_jobs.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '017_dat_rateview_jobs.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 017_dat_rateview_jobs.sql');
  }
  await db.query(fs.readFileSync(migrationPath, 'utf8'));
  const result = await db.query(
    `SELECT to_regclass('public.dat_rateview_jobs') AS dat_jobs_table`
  );
  console.log('DAT RateView migration complete:', result.rows[0]);
}

run()
  .catch(function(err) {
    console.error('DAT RateView migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
