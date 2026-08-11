import crypto from 'crypto';
import db from '../db';
import { parseEmailWithOpenRouter } from '../routes/index';
import { N8nEmailPasteResponse } from '../types/n8n';
import { StandardizedQuote, UnifiedQuoteRequest } from '../types/quote';
import {
  getDefaultProfitMarginPct,
  getUnifiedQuotes,
  UnifiedQuoteResponse
} from './unifiedQuoteService';
import { GmailQuoteMessage } from './gmailQuoteInbox';
import {
  buildCarrierRecommendation,
  CarrierQuoteOption
} from './carrierQuoteOptions';
import { prepareDatRateViewOptions } from './datRateViewJobs';

export interface ShipmentValidation {
  valid: boolean;
  missing: string[];
}

function generateEmailQuoteId(): string {
  return `email-quote-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function finiteNumber(value: any): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizedDate(value: any): string | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizeAccessorial(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const emptyValues = [
    'NONE',
    'NO',
    'N_A',
    'NA',
    'NOT_APPLICABLE',
    'NOT_REQUIRED',
    'NO_ACCESSORIALS'
  ];
  return emptyValues.indexOf(normalized) > -1 ? '' : normalized;
}

export function parsedEmailToShipmentRequest(parsed: N8nEmailPasteResponse): UnifiedQuoteRequest {
  const wrapper: any = parsed && parsed.output ? parsed.output : parsed || {};
  const sample: any = wrapper.parsedSample || wrapper;
  const body: any = sample.body || wrapper.body || {};
  const shipmentDetails: any = body.shipment_details || wrapper.shipment || {};
  const pickup: any = shipmentDetails.pickup || shipmentDetails.shipment?.pickup || {};
  const deliveryOptions: any[] = Array.isArray(shipmentDetails.delivery_options)
    ? shipmentDetails.delivery_options
    : [];
  const delivery: any =
    shipmentDetails.delivery ||
    shipmentDetails.shipment?.delivery ||
    deliveryOptions[0] ||
    {};
  const shipmentInfo: any =
    shipmentDetails.shipment_info ||
    shipmentDetails.shipmentInfo ||
    {};
  const dimensions: any[] = Array.isArray(shipmentInfo.dimensions)
    ? shipmentInfo.dimensions
    : Array.isArray(shipmentDetails.dimensions)
      ? shipmentDetails.dimensions
      : [];
  const specialInstructions: any = body.special_instructions || {};
  const accessorials = Array.isArray(specialInstructions.accessorials)
    ? specialInstructions.accessorials.map(normalizeAccessorial).filter(Boolean)
    : [];
  const complianceFlags = Array.isArray(specialInstructions.compliance_flags)
    ? specialInstructions.compliance_flags
    : [];
  const unNumbers = complianceFlags
    .map(function(flag: any) {
      const match = String(flag || '').toUpperCase().match(/\bUN\d{4}\b/);
      return match ? match[0] : '';
    })
    .filter(Boolean);
  const parts = dimensions.map(function(dimension: any) {
    return {
      count: finiteNumber(dimension.count || dimension.quantity) || 1,
      length: finiteNumber(dimension.length_in || dimension.length),
      width: finiteNumber(dimension.width_in || dimension.width),
      height: finiteNumber(dimension.height_in || dimension.height)
    };
  });
  const inferredQuantity =
    finiteNumber(shipmentInfo.pallets) ||
    finiteNumber(shipmentDetails.pallets) ||
    parts.reduce(function(sum, part) { return sum + Number(part.count || 1); }, 0) ||
    undefined;
  const totalWeight =
    finiteNumber(shipmentInfo.total_weight_lbs) ||
    finiteNumber(shipmentInfo.weight_lbs) ||
    finiteNumber(shipmentDetails.shipment_weight_lbs) ||
    finiteNumber(shipmentDetails.weight);

  return {
    pickup: {
      location: {
        city: pickup.city || undefined,
        state: pickup.state || undefined,
        zip: pickup.zip || pickup.zip_code || undefined,
        country: 'US'
      },
      date: normalizedDate(
        pickup.pickup_date ||
        pickup.requested_date_time ||
        pickup.date_time ||
        pickup.date ||
        shipmentInfo.ready_for_loading_date
      ) || new Date().toISOString()
    },
    delivery: {
      location: {
        city: delivery.city || undefined,
        state: delivery.state || undefined,
        zip: delivery.zip_code || delivery.zip || undefined,
        country: 'US'
      },
      date: normalizedDate(
        delivery.requested_delivery_date ||
        delivery.expected_date ||
        delivery.date
      )
    },
    pieces: {
      quantity: inferredQuantity,
      unit: 'in',
      parts
    },
    weight: {
      value: totalWeight,
      unit: 'lbs'
    },
    truckType:
      shipmentInfo.truck_type ||
      shipmentDetails.truck_type ||
      wrapper.truck_type ||
      undefined,
    commodity: shipmentInfo.commodity || shipmentDetails.commodity || undefined,
    stackable: shipmentInfo.stackable,
    hazardousMaterial: { unNumbers },
    accessorialCodes: accessorials,
    referenceNumber: sample.subject || wrapper.subject || undefined
  };
}

export function validateShipmentRequest(shipment: UnifiedQuoteRequest): ShipmentValidation {
  const missing: string[] = [];
  const pickup = shipment.pickup || {};
  const pickupLocation = pickup.location || {};
  const delivery = shipment.delivery || {};
  const deliveryLocation = delivery.location || {};
  const pieces = shipment.pieces || {};
  const firstPart = Array.isArray(pieces.parts) ? pieces.parts[0] || {} : {};

  if (!pickupLocation.zip && !(pickupLocation.city && pickupLocation.state)) {
    missing.push('pickup location');
  }
  if (!deliveryLocation.zip && !(deliveryLocation.city && deliveryLocation.state)) {
    missing.push('delivery location');
  }
  if (!pickup.date) missing.push('pickup date');
  if (!finiteNumber(pieces.quantity)) missing.push('piece or pallet count');
  if (!finiteNumber(firstPart.length)) missing.push('freight length');
  if (!finiteNumber(firstPart.width)) missing.push('freight width');
  if (!finiteNumber(firstPart.height)) missing.push('freight height');
  if (!finiteNumber(shipment.weight && shipment.weight.value)) missing.push('total weight');

  return { valid: missing.length === 0, missing };
}

function carrierOption(
  key: 'expediteAll' | 'forwardAir',
  quote: StandardizedQuote | undefined
): CarrierQuoteOption {
  const total = finiteNumber(quote && (quote.total != null ? quote.total : quote.lineHaul));
  return {
    key,
    source: quote && quote.source
      ? quote.source === 'ForwardAir' ? 'Forward Air' : quote.source
      : key === 'forwardAir' ? 'Forward Air' : 'ExpediteAll',
    available: Boolean(quote && !quote.error && total),
    ...(total ? { cost: total } : {}),
    ...(finiteNumber(quote && quote.lineHaul) ? { lineHaul: Number(quote!.lineHaul) } : {}),
    ...(finiteNumber(quote && quote.ratePerMile) ? { ratePerMile: Number(quote!.ratePerMile) } : {}),
    truckType: quote && quote.additionalInfo && quote.additionalInfo.truckType
      ? quote.additionalInfo.truckType
      : key === 'forwardAir' ? 'LTL' : undefined,
    transitTime: finiteNumber(quote && quote.additionalInfo && quote.additionalInfo.transitTime),
    rateCalculationId: quote && quote.additionalInfo && quote.additionalInfo.rateCalculationID,
    accessorials: quote && quote.additionalInfo && quote.additionalInfo.accessorials,
    ...(!quote || quote.error || !total
      ? { error: quote && quote.error ? quote.error : 'No valid rate returned' }
      : {})
  };
}

export function mapCarrierQuotes(response: UnifiedQuoteResponse): CarrierQuoteOption[] {
  return [
    carrierOption('forwardAir', response.forwardAir),
    carrierOption('expediteAll', response.expediteAll)
  ];
}

export async function rateEmailQuoteRequest(
  id: string,
  shipmentOverride?: UnifiedQuoteRequest
): Promise<any> {
  const existing = await db.query(
    `SELECT id, shipment_request
     FROM public.email_quote_requests
     WHERE id = $1`,
    [id]
  );
  if (!existing.rows.length) {
    const err: any = new Error('Email quote request not found');
    err.status = 404;
    throw err;
  }
  const shipment: UnifiedQuoteRequest = shipmentOverride ||
    (typeof existing.rows[0].shipment_request === 'string'
      ? JSON.parse(existing.rows[0].shipment_request)
      : existing.rows[0].shipment_request || {});
  const validation = validateShipmentRequest(shipment);
  if (!validation.valid) {
    const result = await db.query(
      `UPDATE public.email_quote_requests
       SET shipment_request = $2::jsonb,
           carrier_quotes = '[]'::jsonb,
           recommendation = NULL,
           status = 'needs_review',
           processing_error = $3
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(shipment), `Missing required details: ${validation.missing.join(', ')}`]
    );
    return result.rows[0];
  }

  await db.query(
    `UPDATE public.email_quote_requests
     SET shipment_request = $2::jsonb,
         status = 'rating',
         processing_error = NULL
     WHERE id = $1`,
    [id, JSON.stringify(shipment)]
  );

  const unified = await getUnifiedQuotes(shipment, {
    includeDat: false,
    applyDefaultMargin: false
  });
  const connectedCarrierQuotes = mapCarrierQuotes(unified);
  let datOptions: CarrierQuoteOption[];
  try {
    datOptions = await prepareDatRateViewOptions(id, shipment);
  } catch (err: any) {
    // Keep connected carrier rating available even when the separate worker queue is unavailable.
    console.error('DAT RateView preparation failed:', err && err.message ? err.message : err);
    datOptions = [{
      key: 'datRateView',
      source: 'DAT RateView',
      available: false,
      selectable: false,
      benchmark: true,
      status: 'failed',
      error: 'DAT worker queue is unavailable. Connected carrier rates are still current.'
    }];
  }
  const carrierQuotes = connectedCarrierQuotes.concat(datOptions);
  const defaultMarginPct = await getDefaultProfitMarginPct();
  const recommendation = buildCarrierRecommendation(carrierQuotes, defaultMarginPct);
  const status = recommendation ? 'ready' : 'needs_review';
  const processingError = recommendation
    ? null
    : 'Forward Air and ExpediteAll did not return an available rate.';
  const result = await db.query(
    `UPDATE public.email_quote_requests
     SET carrier_quotes = $2::jsonb,
         recommendation = $3::jsonb,
         status = $4,
         processing_error = $5,
         last_rated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      JSON.stringify(carrierQuotes),
      recommendation ? JSON.stringify(recommendation) : null,
      status,
      processingError
    ]
  );
  return result.rows[0];
}

export async function processEmailQuoteRequest(id: string): Promise<any> {
  const record = await db.query(
    `SELECT id, raw_text, shipment_request
     FROM public.email_quote_requests
     WHERE id = $1`,
    [id]
  );
  if (!record.rows.length) {
    const err: any = new Error('Email quote request not found');
    err.status = 404;
    throw err;
  }

  try {
    await db.query(
      `UPDATE public.email_quote_requests
       SET status = 'parsing', processing_error = NULL
       WHERE id = $1`,
      [id]
    );
    const parsed = await parseEmailWithOpenRouter(record.rows[0].raw_text);
    const shipment = parsedEmailToShipmentRequest(parsed);
    const existingShipment = typeof record.rows[0].shipment_request === 'string'
      ? JSON.parse(record.rows[0].shipment_request)
      : record.rows[0].shipment_request || {};
    if (!shipment.datEquipmentType && existingShipment.datEquipmentType) {
      shipment.datEquipmentType = existingShipment.datEquipmentType;
    }
    await db.query(
      `UPDATE public.email_quote_requests
       SET parsed_payload = $2::jsonb,
           shipment_request = $3::jsonb
       WHERE id = $1`,
      [id, JSON.stringify(parsed), JSON.stringify(shipment)]
    );
    return await rateEmailQuoteRequest(id, shipment);
  } catch (err: any) {
    await db.query(
      `UPDATE public.email_quote_requests
       SET status = 'failed',
           processing_error = $2
       WHERE id = $1`,
      [id, err && err.message ? err.message : 'Email quote processing failed']
    );
    throw err;
  }
}

export async function ingestGmailQuoteMessage(message: GmailQuoteMessage): Promise<{
  created: boolean;
  record: any;
}> {
  if (message.externalThreadId) {
    const existingThread = await db.query(
      `SELECT * FROM public.email_quote_requests
       WHERE external_thread_id = $1
       ORDER BY received_at ASC
       LIMIT 1`,
      [message.externalThreadId]
    );
    if (existingThread.rows.length) {
      return { created: false, record: existingThread.rows[0] };
    }
  }
  const id = generateEmailQuoteId();
  const inserted = await db.query(
    `INSERT INTO public.email_quote_requests (
       id, mailbox_address, external_message_id, external_thread_id, internet_message_id,
       sender_name, sender_email, recipient_email, subject, received_at, raw_text, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'received'
     )
     ON CONFLICT (external_message_id) DO NOTHING
     RETURNING *`,
    [
      id,
      message.mailboxAddress,
      message.externalMessageId,
      message.externalThreadId || null,
      message.internetMessageId || null,
      message.senderName || null,
      message.senderEmail || null,
      message.recipientEmail || null,
      message.subject || null,
      message.receivedAt || new Date().toISOString(),
      message.rawText
    ]
  );
  if (!inserted.rows.length) {
    const existing = await db.query(
      'SELECT * FROM public.email_quote_requests WHERE external_message_id = $1',
      [message.externalMessageId]
    );
    return { created: false, record: existing.rows[0] };
  }
  const processed = await processEmailQuoteRequest(id);
  return { created: true, record: processed };
}
