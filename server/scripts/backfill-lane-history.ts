/**
 * Seeds lane_rate_history from carrier and DAT results already stored on
 * email quotes, including records archived in crm_archive before the
 * Sept 9 fresh start, so rate-table calibration starts with real prices.
 * Safe to re-run: each quote/option pair is imported once.
 *
 * Usage: DATABASE_ENVIRONMENT=... npm run db:backfill:lane-history
 */

import db from '../db';
import { databaseEnvironment } from '../config/environmentSafety';

const SOURCES = ['expediteAll', 'forwardAir', 'datSpot', 'datContract'];

function zip5(location: any): string | null {
  const match = String(location && location.zip || '').match(/^(\d{5})/);
  return match ? match[1] : null;
}

function positive(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function run() {
  const environment = databaseEnvironment();
  if (environment === 'unlabeled' || environment === 'invalid') {
    throw new Error('Set DATABASE_ENVIRONMENT to development, staging, or production before backfilling');
  }
  const archived = await db.query(
    `SELECT row_data FROM crm_archive.records WHERE table_name = 'email_quote_requests'`
  ).catch(function() { return { rows: [] as any[] }; });
  const current = await db.query(`SELECT to_jsonb(e) AS row_data FROM public.email_quote_requests e`);
  const records = archived.rows.map(function(row: any) { return { row: row.row_data, archived: true }; })
    .concat(current.rows.map(function(row: any) { return { row: row.row_data, archived: false }; }));

  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    const quote = record.row || {};
    const options = Array.isArray(quote.carrier_quotes) ? quote.carrier_quotes : [];
    const shipment = quote.shipment_request || {};
    const pickup = (shipment.pickup && shipment.pickup.location) || {};
    const delivery = (shipment.delivery && shipment.delivery.location) || {};
    const observedAt = quote.last_rated_at || quote.received_at || quote.created_at;
    for (const option of options) {
      if (!option || SOURCES.indexOf(option.key) === -1 || !option.available || !positive(option.cost)) continue;
      const backfillKey = `${quote.id}:${option.key}`;
      const exists = await db.query(
        `SELECT 1 FROM public.lane_rate_history
         WHERE payload->>'backfillKey' = $1
            OR (email_quote_request_id = $2 AND source = $3)
         LIMIT 1`,
        [backfillKey, quote.id, option.key]
      );
      if (exists.rows.length) { skipped += 1; continue; }
      const miles = positive(option.miles) ||
        (positive(option.lineHaul) && positive(option.ratePerMile) ? Math.round(Number(option.lineHaul) / Number(option.ratePerMile)) : null);
      await db.query(
        `INSERT INTO public.lane_rate_history (
           observation_type, source, email_quote_request_id,
           origin_zip, origin_city, origin_state,
           destination_zip, destination_city, destination_state,
           truck_type, miles, weight_lbs, freight_class, total_usd, rate_per_mile,
           from_cache, payload, observed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE,$16::jsonb,$17)`,
        [
          option.key.startsWith('dat') ? 'market_rate' : 'carrier_quote',
          option.key,
          record.archived ? null : quote.id,
          zip5(pickup), pickup.city || null, pickup.state || pickup.state_code || null,
          zip5(delivery), delivery.city || null, delivery.state || delivery.state_code || null,
          shipment.truckType || option.truckType || null,
          miles,
          positive(shipment.weight && shipment.weight.value),
          shipment.forwardAirFreightClass || null,
          Number(option.cost),
          positive(option.ratePerMile),
          JSON.stringify({ ...option, backfillKey, archived: record.archived }),
          observedAt
        ]
      );
      imported += 1;
    }
  }
  console.log(`Lane history backfill: ${imported} imported, ${skipped} already present, from ${records.length} quotes.`);
}

run()
  .catch(function(error) {
    console.error('Lane history backfill failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async function() { await db.pool.end(); });
