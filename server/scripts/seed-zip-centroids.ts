/**
 * Loads US ZIP (ZCTA) centroids into public.zip_centroids for lane mileage
 * estimates on lanes no carrier has reported miles for yet.
 *
 * Source: US Census Bureau Gazetteer ZCTA file (public domain).
 *   curl -O https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip
 *   unzip 2025_Gaz_zcta_national.zip
 * Usage: npm run db:seed:zip-centroids -- ./2025_Gaz_zcta_national.txt
 */

import fs from 'fs';
import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const BATCH_SIZE = 1000;

function parseGazetteer(content: string): Array<{ zip: string; latitude: number; longitude: number }> {
  const lines = content.split(/\r?\n/).filter(function(line) { return line.trim(); });
  // Recent files are pipe-delimited; older releases used tabs.
  const delimiter = lines[0].indexOf('|') > -1 ? '|' : '\t';
  const header = lines[0].split(delimiter).map(function(column) { return column.trim().toUpperCase(); });
  const zipIndex = header.indexOf('GEOID');
  const latIndex = header.indexOf('INTPTLAT');
  const lonIndex = header.indexOf('INTPTLONG');
  if (zipIndex < 0 || latIndex < 0 || lonIndex < 0) {
    throw new Error('Expected GEOID, INTPTLAT, and INTPTLONG columns in the gazetteer file');
  }
  return lines.slice(1).map(function(line) {
    const parts = line.split(delimiter);
    return {
      zip: String(parts[zipIndex] || '').trim(),
      latitude: Number(parts[latIndex]),
      longitude: Number(parts[lonIndex])
    };
  }).filter(function(row) {
    return /^\d{5}$/.test(row.zip) && Number.isFinite(row.latitude) && Number.isFinite(row.longitude);
  });
}

async function run() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Pass the path to the extracted Census ZCTA gazetteer .txt file');
  }
  const environment = databaseEnvironment();
  if (environment === 'unlabeled' || environment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before seeding');
  }
  const rows = parseGazetteer(fs.readFileSync(filePath, 'utf8'));
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    await db.query(
      `INSERT INTO public.zip_centroids (zip, latitude, longitude)
       SELECT * FROM UNNEST($1::text[], $2::numeric[], $3::numeric[])
       ON CONFLICT (zip) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
      [
        batch.map(function(row) { return row.zip; }),
        batch.map(function(row) { return row.latitude; }),
        batch.map(function(row) { return row.longitude; })
      ]
    );
  }
  console.log(`Loaded ${rows.length} ZIP centroids.`);
}

run()
  .catch(function(error) {
    console.error('ZIP centroid seed failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async function() { await db.pool.end(); });
