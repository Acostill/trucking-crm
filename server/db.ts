import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// When compiled, __dirname points to dist/; load .env from project root/server/.env
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL not found in environment. Place it in server/.env');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', function(err: Error) {
  // eslint-disable-next-line no-console
  console.error('Unexpected PG pool error', err);
});

export default {
  query: function(text: string, params?: any[]) {
    return pool.query(text, params);
  },
  pool
};

