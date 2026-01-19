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
  // Execute a query with user context for audit logging
  queryWithUser: async function(text: string, params?: any[], userId?: string | null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Set the user ID in the session if provided (SET LOCAL requires a transaction)
      // Use string interpolation for the SET command to avoid parameter conflicts
      if (userId) {
        // Escape single quotes in userId to prevent SQL injection
        const escapedUserId = userId.replace(/'/g, "''");
        await client.query(`SET LOCAL app.current_user_id = '${escapedUserId}'`);
      } else {
        // Clear the setting if no user ID
        await client.query('RESET app.current_user_id');
      }
      // Execute the actual query with its parameters
      const result = await client.query(text, params || []);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  // Execute multiple queries in a transaction with user context
  transactionWithUser: async function<T>(
    callback: (client: any) => Promise<T>,
    userId?: string | null
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Set the user ID in the session if provided
      // Use string interpolation for the SET command to avoid parameter conflicts
      if (userId) {
        // Escape single quotes in userId to prevent SQL injection
        const escapedUserId = userId.replace(/'/g, "''");
        await client.query(`SET LOCAL app.current_user_id = '${escapedUserId}'`);
      } else {
        await client.query('RESET app.current_user_id');
      }
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  pool
};

