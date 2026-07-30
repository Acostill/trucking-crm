import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '011_email_quote_workflow.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '011_email_quote_workflow.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '011_email_quote_workflow.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 011_email_quote_workflow.sql');
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  const result = await db.query(
    `SELECT
       to_regclass('public.email_quote_requests') AS inbox_table,
       EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'quotes'
           AND column_name = 'source_email_quote_id'
       ) AS quote_link_ready`
  );
  console.log('Email quote migration complete:', result.rows[0]);
}

run()
  .catch(function(err) {
    console.error('Email quote migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
