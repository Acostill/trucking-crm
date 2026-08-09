import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '012_quotes_audit_columns.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '012_quotes_audit_columns.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '012_quotes_audit_columns.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 012_quotes_audit_columns.sql');
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'audit'
       AND table_name = 'quotes_audit'
       AND column_name IN (
         'source_email_quote_id', 'carrier_source', 'carrier_cost', 'margin_pct', 'margin_amount'
       )
     ORDER BY column_name`
  );
  console.log('quotes_audit columns present:', result.rows.map(function(row) { return row.column_name; }));
}

run()
  .catch(function(err) {
    console.error('quotes_audit migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
