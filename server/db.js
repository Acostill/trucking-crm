const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: require('path').join(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL not found in environment. Place it in server/.env');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', function(err) {
  // eslint-disable-next-line no-console
  console.error('Unexpected PG pool error', err);
});

module.exports = {
  query: function(text, params) {
    return pool.query(text, params);
  },
  pool
};


