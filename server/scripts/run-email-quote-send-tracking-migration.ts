import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '015_email_quote_send_tracking.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '015_email_quote_send_tracking.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '015_email_quote_send_tracking.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 015_email_quote_send_tracking.sql');
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'email_quote_requests'
       AND column_name IN ('quote_sent_at', 'quote_sent_to')
     ORDER BY column_name`
  );
  console.log('email_quote_requests send-tracking columns present:', result.rows.map(function(row) { return row.column_name; }));
}

run()
  .catch(function(err) {
    console.error('email quote send-tracking migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
