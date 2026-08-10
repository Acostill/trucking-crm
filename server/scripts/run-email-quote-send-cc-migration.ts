import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '016_email_quote_send_cc.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '016_email_quote_send_cc.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '016_email_quote_send_cc.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 016_email_quote_send_cc.sql');
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'email_quote_requests'
       AND column_name = 'quote_sent_cc'`
  );
  console.log('email_quote_requests quote_sent_cc present:', result.rows.length > 0);
}

run()
  .catch(function(err) {
    console.error('email quote send-cc migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
