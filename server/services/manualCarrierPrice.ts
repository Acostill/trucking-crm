import db from '../db';
import { buildCarrierRecommendation, CarrierQuoteOption } from './carrierQuoteOptions';
import { estimateLaneMiles, recordLaneObservation } from './laneHistory';
import { getDefaultProfitMarginPct } from './unifiedQuoteService';
import { getPricingSettings } from './pricingSettings';

function jsonValue(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_err) { return fallback; }
  }
  return value;
}

/**
 * A price staff got outside the connected APIs — an ExpediteAll portal quote,
 * a phone quote, a driver's number. It becomes a selectable price on the
 * quote and trains the rate table for vehicles no API can price.
 */
export async function addManualCarrierPrice(
  id: string,
  input: { carrierName: string; cost: number; note?: string | null },
  userId: string | null
): Promise<any> {
  const current = await db.query('SELECT * FROM public.email_quote_requests WHERE id = $1', [id]);
  if (!current.rows.length) {
    const err: any = new Error('Email quote request not found');
    err.status = 404;
    throw err;
  }
  const row = current.rows[0];
  const shipment = jsonValue(row.shipment_request, {});
  const mileage = await estimateLaneMiles(shipment);
  const option: CarrierQuoteOption = {
    key: 'manualQuote',
    source: input.carrierName,
    available: true,
    pricingBasis: 'carrier_rate',
    status: 'recorded',
    cost: Number(input.cost.toFixed(2)),
    truckType: shipment.truckType,
    ...(mileage ? { miles: mileage.miles, ratePerMile: Number((input.cost / mileage.miles).toFixed(2)) } : {}),
    note: input.note || 'Recorded by staff',
    lookupTimestamp: new Date().toISOString()
  };
  const options: CarrierQuoteOption[] = jsonValue(row.carrier_quotes, [])
    .filter(function(existing: CarrierQuoteOption) { return existing.key !== 'manualQuote'; })
    .concat(option);
  const settings = await getPricingSettings();
  const recommendation = buildCarrierRecommendation(options, await getDefaultProfitMarginPct(), settings.minMarginAmount);
  const updated = await db.query(
    `UPDATE public.email_quote_requests
     SET carrier_quotes = $2::jsonb,
         recommendation = COALESCE($3::jsonb, recommendation),
         status = CASE WHEN status = 'needs_review' AND $3::jsonb IS NOT NULL THEN 'ready' ELSE status END,
         processing_error = CASE WHEN status = 'needs_review' AND $3::jsonb IS NOT NULL THEN NULL ELSE processing_error END
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(options), recommendation ? JSON.stringify(recommendation) : null]
  );
  await recordLaneObservation({
    observationType: 'carrier_quote',
    source: 'manualQuote',
    emailQuoteRequestId: id,
    shipment,
    miles: option.miles,
    totalUsd: option.cost,
    ratePerMile: option.ratePerMile,
    payload: { ...option, recordedBy: userId },
    replaceForQuote: false
  });
  return updated.rows[0];
}
