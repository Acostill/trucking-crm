import fs from 'fs';
import path from 'path';
import db from '../db';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '014_quote_approver_role.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '014_quote_approver_role.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '014_quote_approver_role.sql')
];
const migrationPath = candidates.find(function(candidate) {
  return fs.existsSync(candidate);
});

async function run() {
  if (!migrationPath) {
    throw new Error('Unable to find 014_quote_approver_role.sql');
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  const result = await db.query(
    `SELECT id, name, description FROM public.roles WHERE name = 'quote_approver'`
  );
  console.log('quote_approver role:', result.rows[0]);
}

run()
  .catch(function(err) {
    console.error('quote_approver role migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
