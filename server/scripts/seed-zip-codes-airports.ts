/**
 * One-off script to seed public.zip_codes with US cargo/trucking airport data from CSV.
 * Usage: npx ts-node server/scripts/seed-zip-codes-airports.ts [path-to-csv]
 * Expects CSV: iata, icao, airport_name, city, state, state_name, zip, airport_type
 */

import fs from 'fs';
import db from '../db';

const DEFAULT_CSV = '/home/gerson/Documents/us_trucking_airports_443_with_zips_corrected.csv';

function parseRow(line: string): { iata: string; airport_name: string; city: string; state_code: string; state_name: string; zip: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  if (parts.length < 8) return null;
  // CSV: iata, icao, airport_name, city, state, state_name, zip, airport_type
  const iata = parts[0].trim();
  const airport_name = parts.length === 8 ? parts[2].trim() : parts.slice(2, parts.length - 5).join(',').trim();
  const city = parts[parts.length - 5].trim();
  const state_code = parts[parts.length - 4].trim();
  const state_name = parts[parts.length - 3].trim();
  const zip = (parts[parts.length - 2] || '').trim();
  return { iata, airport_name, city, state_code, state_name, zip };
}

async function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const rows: Array<{ zip: string; city: string; state_code: string; state_name: string; airport_iata: string; airport_name: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const parsed = parseRow(lines[i]);
    if (!parsed || !parsed.iata || !parsed.city) continue;
    const zip = parsed.zip ? parsed.zip : `AIRPORT-${parsed.iata}`;
    rows.push({
      zip,
      city: parsed.city,
      state_code: parsed.state_code,
      state_name: parsed.state_name,
      airport_iata: parsed.iata,
      airport_name: parsed.airport_name
    });
  }
  console.log(`Inserting ${rows.length} airport rows into public.zip_codes...`);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const insert = `
      INSERT INTO public.zip_codes (zip, city, county, state, state_code, country, is_airport, airport_iata, airport_name)
      VALUES ($1, $2, NULL, $3, $4, 'US', TRUE, $5, $6)
      ON CONFLICT (zip, city) DO UPDATE SET
        state = EXCLUDED.state,
        state_code = EXCLUDED.state_code,
        is_airport = EXCLUDED.is_airport,
        airport_iata = EXCLUDED.airport_iata,
        airport_name = EXCLUDED.airport_name,
        updated_at = NOW()
    `;
    let inserted = 0;
    for (const row of rows) {
      await client.query(insert, [
        row.zip,
        row.city,
        row.state_name,
        row.state_code,
        row.airport_iata,
        row.airport_name
      ]);
      inserted++;
      if (inserted % 50 === 0) process.stdout.write('.');
    }
    await client.query('COMMIT');
    console.log(`\nDone. Inserted/updated ${inserted} rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
