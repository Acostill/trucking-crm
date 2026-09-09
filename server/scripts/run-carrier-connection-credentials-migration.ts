import fs from 'fs';
import path from 'path';
import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const candidates = [
  path.resolve(process.cwd(), 'db', 'sql', '021_carrier_connection_credentials.sql'),
  path.resolve(process.cwd(), 'server', 'db', 'sql', '021_carrier_connection_credentials.sql'),
  path.resolve(__dirname, '..', 'db', 'sql', '021_carrier_connection_credentials.sql')
];

async function run() {
  const migrationPath = candidates.find(function(candidate) { return fs.existsSync(candidate); });
  if (!migrationPath) throw new Error('Unable to find 021_carrier_connection_credentials.sql');
  const environment = databaseEnvironment();
  if (environment === 'unlabeled' || environment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before migrating');
  }
  await db.query(fs.readFileSync(migrationPath, 'utf8'));
  console.log('Carrier connection credentials migration complete.');
}

run()
  .catch(function(error) {
    console.error('Carrier connection credentials migration failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async function() { await db.pool.end(); });
