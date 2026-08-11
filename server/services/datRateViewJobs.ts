import crypto from 'crypto';
import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import {
  CarrierQuoteOption,
  mergeDatCarrierOptions
} from './carrierQuoteOptions';

type DatEquipmentType = 'Van' | 'Flatbed' | 'Reefer';
type DatJobFailureState = 'needs_auth' | 'failed' | 'uncertain';

export interface DatRateViewRequest {
  requestId: string;
  origin: string;
  destination: string;
  equipmentType: DatEquipmentType;
}

interface DatMarketRateCard {
  rateType: 'SPOT' | 'CONTRACT';
  acceptedMarketLane: string;
  averageTotalUsd: number;
  averagePerMileUsd: number;
  lowTotalUsd: number;
  highTotalUsd: number;
  lowPerMileUsd: number;
  highPerMileUsd: number;
  miles: number;
  timeframe: string;
}

export interface DatRateViewResult {
  requestId: string;
  source: 'DAT RateView';
  lookupTimestamp: string;
  acceptedOrigin: string;
  acceptedDestination: string;
  acceptedEquipmentType: DatEquipmentType;
  spot: DatMarketRateCard;
  contract: DatMarketRateCard;
}

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

function finitePositive(value: any): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function cleanText(value: any): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isDatWorkerEnabled(): boolean {
  return String(process.env.DAT_WORKER_ENABLED || '').toLowerCase() === 'true';
}

export function normalizeDatEquipment(shipment: UnifiedQuoteRequest): DatEquipmentType | null {
  const raw = cleanText(
    shipment.datEquipmentType || shipment.equipmentCategory || shipment.truckType
  ).toLowerCase();
  if (!raw) return null;
  if (/flat/.test(raw)) return 'Flatbed';
  if (/reefer|refrigerat|temperature|temp.control/.test(raw)) return 'Reefer';
  if (/dry.?van|\bvan\b/.test(raw)) return 'Van';
  return null;
}

function locationLabel(location: any): string {
  const city = cleanText(location && location.city);
  const state = cleanText(location && (location.state || location.state_code)).toUpperCase();
  const zip = cleanText(location && location.zip);
  if (city && state) return `${city}, ${state}`;
  if (zip) return zip;
  return '';
}

export function buildDatRateViewRequest(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): { request: DatRateViewRequest; fingerprint: string } | null {
  const origin = locationLabel(shipment.pickup && shipment.pickup.location);
  const destination = locationLabel(shipment.delivery && shipment.delivery.location);
  const equipmentType = normalizeDatEquipment(shipment);
  if (!origin || !destination || !equipmentType) return null;
  const canonical = JSON.stringify({
    origin: origin.toLowerCase(),
    destination: destination.toLowerCase(),
    equipmentType: equipmentType.toLowerCase()
  });
  const fingerprint = crypto.createHash('sha256').update(canonical).digest('hex');
  return {
    fingerprint,
    request: {
      requestId: `${emailQuoteRequestId}:${fingerprint.slice(0, 16)}`,
      origin,
      destination,
      equipmentType
    }
  };
}

function datPlaceholder(status: string, error: string): CarrierQuoteOption {
  return {
    key: 'datRateView',
    source: 'DAT RateView',
    available: false,
    selectable: false,
    benchmark: true,
    status,
    error
  };
}

function resultCard(
  key: 'datSpot' | 'datContract',
  source: string,
  result: DatRateViewResult,
  card: DatMarketRateCard
): CarrierQuoteOption {
  return {
    key,
    source,
    available: true,
    selectable: false,
    benchmark: true,
    status: 'completed',
    cost: card.averageTotalUsd,
    marketAverage: card.averageTotalUsd,
    marketLow: card.lowTotalUsd,
    marketHigh: card.highTotalUsd,
    ratePerMile: card.averagePerMileUsd,
    lowRatePerMile: card.lowPerMileUsd,
    highRatePerMile: card.highPerMileUsd,
    miles: card.miles,
    timeframe: card.timeframe,
    truckType: result.acceptedEquipmentType,
    lookupTimestamp: result.lookupTimestamp,
    acceptedMarketLane: card.acceptedMarketLane
  };
}

export function mapDatRateViewResult(result: DatRateViewResult): CarrierQuoteOption[] {
  return [
    resultCard('datSpot', 'DAT Spot Market', result, result.spot),
    resultCard('datContract', 'DAT Contract Market', result, result.contract)
  ];
}

function validateMarketCard(value: any, expected: 'SPOT' | 'CONTRACT'): DatMarketRateCard {
  if (!value || value.rateType !== expected) {
    throw new Error(`DAT ${expected.toLowerCase()} result is missing`);
  }
  const card: DatMarketRateCard = {
    rateType: expected,
    acceptedMarketLane: cleanText(value.acceptedMarketLane),
    averageTotalUsd: Number(value.averageTotalUsd),
    averagePerMileUsd: Number(value.averagePerMileUsd),
    lowTotalUsd: Number(value.lowTotalUsd),
    highTotalUsd: Number(value.highTotalUsd),
    lowPerMileUsd: Number(value.lowPerMileUsd),
    highPerMileUsd: Number(value.highPerMileUsd),
    miles: Number(value.miles),
    timeframe: cleanText(value.timeframe)
  };
  const numericValues = [
    card.averageTotalUsd,
    card.averagePerMileUsd,
    card.lowTotalUsd,
    card.highTotalUsd,
    card.lowPerMileUsd,
    card.highPerMileUsd,
    card.miles
  ];
  if (!card.acceptedMarketLane || !card.timeframe || numericValues.some(function(number) {
    return !Number.isFinite(number) || number <= 0;
  })) {
    throw new Error(`DAT ${expected.toLowerCase()} result is invalid`);
  }
  if (
    card.lowTotalUsd > card.averageTotalUsd ||
    card.averageTotalUsd > card.highTotalUsd ||
    card.lowPerMileUsd > card.averagePerMileUsd ||
    card.averagePerMileUsd > card.highPerMileUsd
  ) {
    throw new Error(`DAT ${expected.toLowerCase()} range is inconsistent`);
  }
  return card;
}

export function validateDatRateViewResult(value: any): DatRateViewResult {
  if (!value || value.source !== 'DAT RateView') {
    throw new Error('DAT RateView result source is invalid');
  }
  const equipment = cleanText(value.acceptedEquipmentType);
  if (['Van', 'Flatbed', 'Reefer'].indexOf(equipment) === -1) {
    throw new Error('DAT RateView equipment is invalid');
  }
  const timestamp = new Date(value.lookupTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('DAT RateView lookup timestamp is invalid');
  }
  const result: DatRateViewResult = {
    requestId: cleanText(value.requestId),
    source: 'DAT RateView',
    lookupTimestamp: timestamp.toISOString(),
    acceptedOrigin: cleanText(value.acceptedOrigin),
    acceptedDestination: cleanText(value.acceptedDestination),
    acceptedEquipmentType: equipment as DatEquipmentType,
    spot: validateMarketCard(value.spot, 'SPOT'),
    contract: validateMarketCard(value.contract, 'CONTRACT')
  };
  if (!result.requestId || !result.acceptedOrigin || !result.acceptedDestination) {
    throw new Error('DAT RateView request identity is incomplete');
  }
  return result;
}

function placeholderForJobStatus(status: string, message?: string | null): CarrierQuoteOption {
  if (status === 'pending') {
    return datPlaceholder('pending', 'Approved and waiting for the DAT worker.');
  }
  if (status === 'claimed' || status === 'running') {
    return datPlaceholder('running', 'The DAT worker is checking this lane now.');
  }
  if (status === 'needs_auth') {
    return datPlaceholder('needs_auth', 'DAT sign-in is required on the worker, then approve this lane again.');
  }
  if (status === 'uncertain') {
    return datPlaceholder('uncertain', 'DAT submission outcome is uncertain. Reconcile this lookup before trying again.');
  }
  if (status === 'failed') {
    return datPlaceholder('failed', 'DAT did not return a usable market rate. Review the worker log, then approve again if no search was submitted.');
  }
  return datPlaceholder('awaiting_approval', 'Review this lane, then approve one DAT lookup.');
}

export async function prepareDatRateViewOptions(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): Promise<CarrierQuoteOption[]> {
  if (!isDatWorkerEnabled()) {
    return [datPlaceholder('disabled', 'DAT worker is not enabled on the server.')];
  }
  const candidate = buildDatRateViewRequest(emailQuoteRequestId, shipment);
  if (!candidate) {
    return [datPlaceholder('needs_equipment', 'Choose Van, Flatbed, or Reefer to prepare DAT RateView.')];
  }
  await db.query(
    `UPDATE public.dat_rateview_jobs
     SET status = 'cancelled'
     WHERE email_quote_request_id = $1
       AND request_fingerprint <> $2
       AND status = 'pending'`,
    [emailQuoteRequestId, candidate.fingerprint]
  );
  const prior = await db.query(
    `SELECT status, result_payload, error_message
     FROM public.dat_rateview_jobs
     WHERE email_quote_request_id = $1 AND request_fingerprint = $2`,
    [emailQuoteRequestId, candidate.fingerprint]
  );
  if (!prior.rows.length) {
    return [placeholderForJobStatus('awaiting_approval')];
  }
  const job = prior.rows[0];
  if (job.status === 'completed' && job.result_payload) {
    return mapDatRateViewResult(validateDatRateViewResult(jsonValue(job.result_payload, null)));
  }
  return [placeholderForJobStatus(job.status, job.error_message)];
}

export async function requestDatRateViewLookup(
  emailQuoteRequestId: string,
  approvedBy: string
): Promise<any> {
  if (!isDatWorkerEnabled()) {
    const err: any = new Error('DAT_WORKER_ENABLED is not true on the server');
    err.status = 503;
    throw err;
  }
  return db.transactionWithUser(async function(client) {
    const quoteResult = await client.query(
      `SELECT * FROM public.email_quote_requests WHERE id = $1 FOR UPDATE`,
      [emailQuoteRequestId]
    );
    if (!quoteResult.rows.length) {
      const err: any = new Error('Email quote request not found');
      err.status = 404;
      throw err;
    }
    const quote = quoteResult.rows[0];
    const shipment = jsonValue(quote.shipment_request, {});
    const candidate = buildDatRateViewRequest(emailQuoteRequestId, shipment);
    if (!candidate) {
      const err: any = new Error('Choose Van, Flatbed, or Reefer and provide both lane locations first');
      err.status = 400;
      throw err;
    }
    const existing = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE email_quote_request_id = $1 AND request_fingerprint = $2
       FOR UPDATE`,
      [emailQuoteRequestId, candidate.fingerprint]
    );
    let job = existing.rows[0];
    if (job && job.status === 'uncertain') {
      const err: any = new Error('This DAT lookup is uncertain and must be reconciled before resubmission');
      err.status = 409;
      throw err;
    }
    if (!job) {
      const inserted = await client.query(
        `INSERT INTO public.dat_rateview_jobs (
           id, email_quote_request_id, request_fingerprint, status,
           input_payload, approved_by, approved_at
         ) VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, NOW())
         RETURNING *`,
        [
          `dat-job-${crypto.randomUUID()}`,
          emailQuoteRequestId,
          candidate.fingerprint,
          JSON.stringify(candidate.request),
          approvedBy
        ]
      );
      job = inserted.rows[0];
    } else if (['needs_auth', 'failed', 'cancelled'].indexOf(job.status) > -1) {
      const reset = await client.query(
        `UPDATE public.dat_rateview_jobs
         SET status = 'pending', input_payload = $2::jsonb,
             approved_by = $3, approved_at = NOW(), worker_id = NULL,
             claimed_at = NULL, started_at = NULL, completed_at = NULL,
             result_payload = NULL, error_category = NULL, error_message = NULL
         WHERE id = $1
         RETURNING *`,
        [job.id, JSON.stringify(candidate.request), approvedBy]
      );
      job = reset.rows[0];
    }
    const currentOptions: CarrierQuoteOption[] = jsonValue(quote.carrier_quotes, []);
    const datOptions = job.status === 'completed' && job.result_payload
      ? mapDatRateViewResult(validateDatRateViewResult(jsonValue(job.result_payload, null)))
      : [placeholderForJobStatus(job.status, job.error_message)];
    const updated = await client.query(
      `UPDATE public.email_quote_requests
       SET carrier_quotes = $2::jsonb
       WHERE id = $1
       RETURNING *`,
      [emailQuoteRequestId, JSON.stringify(mergeDatCarrierOptions(currentOptions, datOptions))]
    );
    return updated.rows[0];
  }, approvedBy);
}

export async function claimDatRateViewJob(workerId: string): Promise<any | null> {
  return db.transactionWithUser(async function(client) {
    const staleRunning = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'uncertain', error_category = 'WORKER_HEARTBEAT_LOST',
           error_message = 'The worker stopped reporting after this lookup began.',
           completed_at = NOW()
       WHERE status = 'running'
         AND started_at < NOW() - INTERVAL '15 minutes'
       RETURNING *`
    );
    for (const staleJob of staleRunning.rows) {
      await updateQuoteDatPlaceholder(
        client,
        staleJob,
        placeholderForJobStatus('uncertain')
      );
    }
    await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'pending', worker_id = NULL, claimed_at = NULL
       WHERE status = 'claimed'
         AND started_at IS NULL
         AND claimed_at < NOW() - INTERVAL '10 minutes'`
    );
    const pending = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE status = 'pending'
       ORDER BY approved_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    if (!pending.rows.length) return null;
    const updated = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'claimed', worker_id = $2, claimed_at = NOW(),
           attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING *`,
      [pending.rows[0].id, workerId]
    );
    const job = updated.rows[0];
    await updateQuoteDatPlaceholder(client, job, placeholderForJobStatus('claimed'));
    return {
      id: job.id,
      request: jsonValue(job.input_payload, {}),
      approvedAt: job.approved_at,
      attemptCount: job.attempt_count
    };
  });
}

export async function startDatRateViewJob(id: string, workerId: string): Promise<void> {
  await db.transactionWithUser(async function(client) {
    const result = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'running', started_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status = 'claimed'
       RETURNING *`,
      [id, workerId]
    );
    if (!result.rows.length) {
      const err: any = new Error('DAT job is not claimed by this worker');
      err.status = 409;
      throw err;
    }
    await updateQuoteDatPlaceholder(client, result.rows[0], placeholderForJobStatus('running'));
  });
}

async function updateQuoteDatPlaceholder(
  client: any,
  job: any,
  option: CarrierQuoteOption
): Promise<void> {
  const quoteResult = await client.query(
    `SELECT shipment_request, carrier_quotes
     FROM public.email_quote_requests
     WHERE id = $1 FOR UPDATE`,
    [job.email_quote_request_id]
  );
  if (!quoteResult.rows.length) return;
  const quote = quoteResult.rows[0];
  const candidate = buildDatRateViewRequest(
    job.email_quote_request_id,
    jsonValue(quote.shipment_request, {})
  );
  if (!candidate || candidate.fingerprint !== job.request_fingerprint) return;
  const options: CarrierQuoteOption[] = jsonValue(quote.carrier_quotes, []);
  await client.query(
    `UPDATE public.email_quote_requests SET carrier_quotes = $2::jsonb WHERE id = $1`,
    [job.email_quote_request_id, JSON.stringify(mergeDatCarrierOptions(options, [option]))]
  );
}

export async function completeDatRateViewJob(
  id: string,
  workerId: string,
  rawResult: any
): Promise<void> {
  const result = validateDatRateViewResult(rawResult);
  await db.transactionWithUser(async function(client) {
    const updated = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'completed', result_payload = $3::jsonb,
           error_category = NULL, error_message = NULL, completed_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status IN ('claimed', 'running')
       RETURNING *`,
      [id, workerId, JSON.stringify(result)]
    );
    if (!updated.rows.length) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    const input: DatRateViewRequest = jsonValue(updated.rows[0].input_payload, {});
    if (
      result.requestId !== input.requestId ||
      cleanText(result.acceptedOrigin).toLowerCase() !== cleanText(input.origin).toLowerCase() ||
      cleanText(result.acceptedDestination).toLowerCase() !== cleanText(input.destination).toLowerCase() ||
      result.acceptedEquipmentType !== input.equipmentType
    ) {
      const err: any = new Error('DAT result does not match the claimed request');
      err.status = 400;
      throw err;
    }
    await updateQuoteDatPlaceholder(
      client,
      updated.rows[0],
      mapDatRateViewResult(result)[0]
    );
    const quoteResult = await client.query(
      `SELECT shipment_request, carrier_quotes
       FROM public.email_quote_requests WHERE id = $1 FOR UPDATE`,
      [updated.rows[0].email_quote_request_id]
    );
    if (!quoteResult.rows.length) return;
    const quote = quoteResult.rows[0];
    const candidate = buildDatRateViewRequest(
      updated.rows[0].email_quote_request_id,
      jsonValue(quote.shipment_request, {})
    );
    if (!candidate || candidate.fingerprint !== updated.rows[0].request_fingerprint) return;
    const options: CarrierQuoteOption[] = jsonValue(quote.carrier_quotes, []);
    await client.query(
      `UPDATE public.email_quote_requests SET carrier_quotes = $2::jsonb WHERE id = $1`,
      [
        updated.rows[0].email_quote_request_id,
        JSON.stringify(mergeDatCarrierOptions(options, mapDatRateViewResult(result)))
      ]
    );
  });
}

export async function failDatRateViewJob(
  id: string,
  workerId: string,
  state: DatJobFailureState,
  category: string,
  message: string
): Promise<void> {
  await db.transactionWithUser(async function(client) {
    const updated = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = $3, error_category = $4, error_message = $5,
           completed_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status IN ('claimed', 'running')
       RETURNING *`,
      [id, workerId, state, cleanText(category).slice(0, 100), cleanText(message).slice(0, 500)]
    );
    if (!updated.rows.length) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    await updateQuoteDatPlaceholder(
      client,
      updated.rows[0],
      placeholderForJobStatus(state, message)
    );
  });
}

export async function getDatWorkerStatus(): Promise<any> {
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
       COUNT(*) FILTER (WHERE status IN ('claimed', 'running'))::integer AS active,
       MAX(completed_at) FILTER (WHERE status = 'completed') AS last_completed_at
     FROM public.dat_rateview_jobs`
  );
  return {
    enabled: isDatWorkerEnabled(),
    pending: Number(result.rows[0].pending || 0),
    active: Number(result.rows[0].active || 0),
    lastCompletedAt: result.rows[0].last_completed_at || null
  };
}
