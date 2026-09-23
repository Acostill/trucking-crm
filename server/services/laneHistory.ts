import crypto from 'crypto';
import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import { CarrierQuoteOption } from './carrierQuoteOptions';

/**
 * Append-only lane history. A broker's best pricing data is what it quoted,
 * whether it won, and what it actually paid the truck on each lane.
 */

export type ObservationType =
  | 'carrier_quote'
  | 'market_rate'
  | 'rate_table'
  | 'customer_price'
  | 'truck_cost';

export interface LaneObservation {
  observationType: ObservationType;
  source: string;
  emailQuoteRequestId?: string | null;
  shipment: UnifiedQuoteRequest;
  miles?: number | null;
  totalUsd?: number | null;
  ratePerMile?: number | null;
  requestFingerprint?: string | null;
  fromCache?: boolean;
  payload?: any;
  // Keep one row of this type per quote (a re-price or corrected truck cost
  // replaces the earlier value instead of double-counting it).
  replaceForQuote?: boolean;
}

/** How long a carrier rate can be reused for an identical request. */
export const CARRIER_CACHE_MAX_AGE_DAYS: Record<string, number> = {
  // LTL tariffs change about once a year; fuel moves weekly.
  forwardAir: 7,
  // Expedite per-mile pricing moves with driver availability.
  expediteAll: 3
};

/** US truck routes run ~5–15% longer than straight-line distance. */
export const ROAD_CIRCUITY_FACTOR = 1.1;

function positive(value: any): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function zip5(location: any): string {
  const match = String(location && location.zip || '').match(/^(\d{5})/);
  return match ? match[1] : '';
}

export function carrierRequestFingerprint(
  source: 'forwardAir' | 'expediteAll',
  shipment: UnifiedQuoteRequest
): string | null {
  const origin = zip5(shipment.pickup && shipment.pickup.location);
  const destination = zip5(shipment.delivery && shipment.delivery.location);
  if (!origin || !destination) return null;
  const pieces = shipment.pieces || {};
  const canonical = source === 'forwardAir'
    ? {
        source,
        origin,
        destination,
        freightClass: shipment.forwardAirFreightClass || null,
        weight: shipment.weight ? shipment.weight.value || null : null,
        quantity: pieces.quantity || null,
        parts: (pieces.parts || []).map(function(part: any) {
          return [part.count || 1, part.length || null, part.width || null, part.height || null];
        }),
        hazmat: (shipment.hazardousMaterial && shipment.hazardousMaterial.unNumbers || []).slice().sort(),
        accessorials: (shipment.accessorialCodes || []).slice().sort()
      }
    : {
        source,
        origin,
        destination,
        truckType: shipment.truckType || null,
        weight: shipment.weight ? shipment.weight.value || null : null,
        accessorials: (shipment.accessorialCodes || []).slice().sort()
      };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function recordLaneObservation(observation: LaneObservation, client: any = db): Promise<void> {
  const shipment = observation.shipment || {};
  const pickup = (shipment.pickup && shipment.pickup.location) || {};
  const delivery = (shipment.delivery && shipment.delivery.location) || {};
  // Inside a caller's transaction a failed statement would abort the whole
  // transaction, so history writes are isolated behind a savepoint.
  const inTransaction = client !== db;
  try {
    if (inTransaction) await client.query('SAVEPOINT lane_history_write');
    if (observation.replaceForQuote && observation.emailQuoteRequestId) {
      await client.query(
        `DELETE FROM public.lane_rate_history
         WHERE email_quote_request_id = $1 AND observation_type = $2`,
        [observation.emailQuoteRequestId, observation.observationType]
      );
    }
    await client.query(
      `INSERT INTO public.lane_rate_history (
         observation_type, source, email_quote_request_id,
         origin_zip, origin_city, origin_state,
         destination_zip, destination_city, destination_state,
         truck_type, miles, weight_lbs, freight_class,
         total_usd, rate_per_mile, request_fingerprint, from_cache, payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)`,
      [
        observation.observationType,
        observation.source,
        observation.emailQuoteRequestId || null,
        zip5(pickup) || null,
        pickup.city || null,
        (pickup.state || pickup.state_code || null),
        zip5(delivery) || null,
        delivery.city || null,
        (delivery.state || delivery.state_code || null),
        shipment.truckType || null,
        positive(observation.miles) || null,
        positive(shipment.weight && shipment.weight.value) || null,
        shipment.forwardAirFreightClass || null,
        positive(observation.totalUsd) || null,
        positive(observation.ratePerMile) || null,
        observation.requestFingerprint || null,
        observation.fromCache === true,
        observation.payload == null ? null : JSON.stringify(observation.payload)
      ]
    );
    if (inTransaction) await client.query('RELEASE SAVEPOINT lane_history_write');
  } catch (err: any) {
    // History is advisory; a missing migration must never block quoting.
    console.error('Lane history write failed:', err && err.message ? err.message : err);
    if (inTransaction) {
      await client.query('ROLLBACK TO SAVEPOINT lane_history_write').catch(function() {});
    }
  }
}

export async function recordCarrierOptions(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest,
  options: CarrierQuoteOption[]
): Promise<void> {
  for (const option of options) {
    if (!option.available || !positive(option.cost)) continue;
    const observationType: ObservationType = option.key === 'rateTable'
      ? 'rate_table'
      : option.benchmark ? 'market_rate' : 'carrier_quote';
    await recordLaneObservation({
      observationType,
      source: option.key,
      emailQuoteRequestId,
      shipment,
      miles: option.miles,
      totalUsd: option.cost,
      ratePerMile: option.ratePerMile,
      requestFingerprint: option.requestFingerprint || null,
      fromCache: option.fromCache === true,
      payload: option
    });
  }
}

/**
 * A live carrier rate for an identical request that is recent enough to reuse,
 * so the same lane is not re-requested from the carrier for every inquiry.
 */
export async function findCachedCarrierOption(
  source: 'forwardAir' | 'expediteAll',
  fingerprint: string | null
): Promise<CarrierQuoteOption | null> {
  if (!fingerprint) return null;
  const maxAgeDays = CARRIER_CACHE_MAX_AGE_DAYS[source];
  try {
    const result = await db.query(
      `SELECT payload, observed_at
       FROM public.lane_rate_history
       WHERE source = $1
         AND request_fingerprint = $2
         AND from_cache = FALSE
         AND observation_type = 'carrier_quote'
         AND observed_at > NOW() - ($3::text || ' days')::interval
       ORDER BY observed_at DESC
       LIMIT 1`,
      [source, fingerprint, String(maxAgeDays)]
    );
    if (!result.rows.length || !result.rows[0].payload) return null;
    const payload = typeof result.rows[0].payload === 'string'
      ? JSON.parse(result.rows[0].payload)
      : result.rows[0].payload;
    return {
      ...payload,
      fromCache: true,
      cachedAt: new Date(result.rows[0].observed_at).toISOString()
    };
  } catch (err: any) {
    console.error('Lane history cache lookup failed:', err && err.message ? err.message : err);
    return null;
  }
}

export function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const radius = 3958.8;
  const toRad = function(degrees: number) { return (degrees * Math.PI) / 180; };
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export interface MileageEstimate {
  miles: number;
  method: 'lane_history' | 'zip_centroid';
}

/**
 * Prefer miles a carrier or DAT already reported for this exact ZIP pair;
 * otherwise estimate from ZIP centroids with a road circuity factor.
 */
export async function estimateLaneMiles(shipment: UnifiedQuoteRequest): Promise<MileageEstimate | null> {
  const origin = zip5(shipment.pickup && shipment.pickup.location);
  const destination = zip5(shipment.delivery && shipment.delivery.location);
  if (!origin || !destination) return null;
  try {
    const reported = await db.query(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY miles) AS miles
       FROM public.lane_rate_history
       WHERE origin_zip = $1 AND destination_zip = $2
         AND miles > 0 AND observation_type IN ('carrier_quote', 'market_rate')
         AND observed_at > NOW() - INTERVAL '365 days'`,
      [origin, destination]
    );
    const reportedMiles = positive(reported.rows[0] && reported.rows[0].miles);
    if (reportedMiles) return { miles: Math.round(reportedMiles), method: 'lane_history' };

    // PO-box and single-business ZIPs (airports, large shippers) have no
    // Census centroid, so fall back to the average of their 3-digit area.
    const centroids = await db.query(
      `SELECT wanted.zip,
              COALESCE(exact.latitude, area.latitude) AS latitude,
              COALESCE(exact.longitude, area.longitude) AS longitude
       FROM UNNEST($1::text[]) AS wanted(zip)
       LEFT JOIN public.zip_centroids exact ON exact.zip = wanted.zip
       LEFT JOIN LATERAL (
         SELECT AVG(latitude) AS latitude, AVG(longitude) AS longitude
         FROM public.zip_centroids
         WHERE LEFT(zip, 3) = LEFT(wanted.zip, 3)
       ) area ON TRUE`,
      [[origin, destination]]
    );
    const byZip: Record<string, any> = {};
    centroids.rows.forEach(function(row: any) {
      if (row.latitude != null && row.longitude != null) byZip[row.zip] = row;
    });
    if (!byZip[origin] || !byZip[destination]) return null;
    const straightLine = haversineMiles(
      { latitude: Number(byZip[origin].latitude), longitude: Number(byZip[origin].longitude) },
      { latitude: Number(byZip[destination].latitude), longitude: Number(byZip[destination].longitude) }
    );
    return { miles: Math.max(1, Math.round(straightLine * ROAD_CIRCUITY_FACTOR)), method: 'zip_centroid' };
  } catch (err: any) {
    console.error('Lane mileage estimate failed:', err && err.message ? err.message : err);
    return null;
  }
}

/**
 * What First Class actually paid trucks on this 3-digit ZIP lane recently.
 * Shown next to market rates as the brokerage's own benchmark.
 */
export async function laneHistoryOption(shipment: UnifiedQuoteRequest): Promise<CarrierQuoteOption | null> {
  const origin = zip5(shipment.pickup && shipment.pickup.location);
  const destination = zip5(shipment.delivery && shipment.delivery.location);
  if (!origin || !destination || !shipment.truckType) return null;
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS loads,
              AVG(total_usd) AS average,
              MIN(total_usd) AS low,
              MAX(total_usd) AS high,
              AVG(rate_per_mile) AS rpm,
              AVG(miles) AS miles
       FROM public.lane_rate_history
       WHERE observation_type = 'truck_cost'
         AND LEFT(origin_zip, 3) = LEFT($1, 3)
         AND LEFT(destination_zip, 3) = LEFT($2, 3)
         AND REGEXP_REPLACE(COALESCE(truck_type, ''), '^Reefer ', '') = REGEXP_REPLACE($3, '^Reefer ', '')
         AND observed_at > NOW() - INTERVAL '90 days'`,
      [origin, destination, shipment.truckType]
    );
    const row = result.rows[0];
    if (!row || !Number(row.loads)) return null;
    return {
      key: 'laneHistory',
      source: 'First Class lane history',
      available: true,
      selectable: false,
      benchmark: true,
      status: 'completed',
      cost: Number(Number(row.average).toFixed(2)),
      marketAverage: Number(Number(row.average).toFixed(2)),
      marketLow: Number(row.low),
      marketHigh: Number(row.high),
      ...(positive(row.rpm) ? { ratePerMile: Number(Number(row.rpm).toFixed(2)) } : {}),
      ...(positive(row.miles) ? { miles: Math.round(Number(row.miles)) } : {}),
      timeframe: `Paid to trucks · last 90 days · ${row.loads} load${Number(row.loads) === 1 ? '' : 's'}`,
      truckType: shipment.truckType
    };
  } catch (err: any) {
    console.error('Lane history summary failed:', err && err.message ? err.message : err);
    return null;
  }
}
