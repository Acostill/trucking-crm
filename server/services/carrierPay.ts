import { recordLaneObservation } from './laneHistory';

function jsonValue(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_err) { return fallback; }
  }
  return value;
}

/**
 * The buy rate actually paid for a covered load. Whether staff enter it on
 * the load (where the truck is booked) or on the quote's outcome, it is kept
 * in both places and saved to lane history, which is what trains pricing.
 * Runs inside the caller's transaction.
 */
export async function syncCarrierPay(
  client: any,
  target: { emailQuoteRequestId?: string | null; loadId?: number | null; quoteId?: string | null },
  carrierPay: number,
  carrierName: string | null
): Promise<void> {
  let emailQuoteId = target.emailQuoteRequestId || null;
  let quoteId = target.quoteId || null;

  if (!emailQuoteId && target.loadId) {
    const link = await client.query(
      `SELECT q.id AS quote_id, q.source_email_quote_id
       FROM public.loads l
       JOIN public.quotes q ON q.id = l.source_quote_id
       WHERE l.id = $1`,
      [target.loadId]
    );
    if (link.rows.length) {
      emailQuoteId = link.rows[0].source_email_quote_id || null;
      quoteId = link.rows[0].quote_id;
    }
  }

  if (emailQuoteId) {
    const updated = await client.query(
      `UPDATE public.email_quote_requests
       SET truck_cost = $2,
           truck_carrier_name = COALESCE($3, truck_carrier_name),
           truck_covered_at = COALESCE(truck_covered_at, NOW())
       WHERE id = $1
       RETURNING quote_id, shipment_request, carrier_quotes, client_price`,
      [emailQuoteId, carrierPay, carrierName]
    );
    if (updated.rows.length) {
      const row = updated.rows[0];
      quoteId = quoteId || row.quote_id;
      const options: any[] = jsonValue(row.carrier_quotes, []);
      const withMiles = options.find(function(option) { return Number(option && option.miles) > 0; });
      const miles = withMiles ? Number(withMiles.miles) : null;
      await recordLaneObservation({
        observationType: 'truck_cost',
        source: carrierName || 'covered_truck',
        emailQuoteRequestId: emailQuoteId,
        shipment: jsonValue(row.shipment_request, {}),
        miles,
        totalUsd: carrierPay,
        ratePerMile: miles ? carrierPay / miles : null,
        payload: { clientPrice: row.client_price == null ? null : Number(row.client_price), carrierName },
        replaceForQuote: true
      }, client);
    }
  }

  if (quoteId && !target.loadId) {
    await client.query(
      `UPDATE public.loads
       SET carrier_pay = $2, carrier_name = COALESCE($3, carrier_name), updated_at = NOW()
       WHERE source_quote_id = $1`,
      [quoteId, carrierPay, carrierName]
    );
  }
}
