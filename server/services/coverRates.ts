import db from '../db';
import { getUnifiedQuotes } from './unifiedQuoteService';
import { mapCarrierQuotes } from './emailQuoteWorkflow';
import { carrierRequestFingerprint, recordCarrierOptions } from './laneHistory';
import { CarrierQuoteOption } from './carrierQuoteOptions';
import { isExpediteAllRateable } from './quoteRouting';

function jsonValue(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return fallback;
    }
  }
  return value;
}

/**
 * Staff-triggered ExpediteAll rate for covering an expedite load. Asking only
 * when a truck is actually needed keeps First Class's request-to-booking
 * ratio with ExpediteAll healthy.
 */
export async function requestExpediteAllCoverRate(id: string): Promise<any> {
  const current = await db.query(
    'SELECT * FROM public.email_quote_requests WHERE id = $1',
    [id]
  );
  if (!current.rows.length) {
    const err: any = new Error('Email quote request not found');
    err.status = 404;
    throw err;
  }
  const row = current.rows[0];
  const shipment = jsonValue(row.shipment_request, {});
  if (!isExpediteAllRateable(shipment)) {
    const err: any = new Error('ExpediteAll\'s API only rates Cargo Vans up to 3,000 lb. Request a portal quote for other equipment.');
    err.status = 400;
    throw err;
  }
  const unified = await getUnifiedQuotes(shipment, {
    includeDat: false,
    applyDefaultMargin: false,
    includeForwardAir: false,
    includeExpediteAll: true
  });
  const fingerprint = carrierRequestFingerprint('expediteAll', shipment);
  const expediteAll: CarrierQuoteOption[] = mapCarrierQuotes(unified).map(function(option) {
    return {
      ...option,
      pricingBasis: 'carrier_rate' as const,
      ...(fingerprint ? { requestFingerprint: fingerprint } : {})
    };
  });
  await recordCarrierOptions(id, shipment, expediteAll);
  const options: CarrierQuoteOption[] = jsonValue(row.carrier_quotes, [])
    .filter(function(option: CarrierQuoteOption) { return option.key !== 'expediteAll'; })
    .concat(expediteAll);
  const updated = await db.query(
    `UPDATE public.email_quote_requests SET carrier_quotes = $2::jsonb WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(options)]
  );
  return updated.rows[0];
}
