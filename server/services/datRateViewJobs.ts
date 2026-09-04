import crypto from 'crypto';
import { isDeepStrictEqual } from 'util';
import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import {
  CarrierQuoteOption,
  mergeDatCarrierOptions
} from './carrierQuoteOptions';

type DatEquipmentType = 'Van' | 'Flatbed' | 'Reefer';
type DatJobFailureState = 'needs_auth' | 'failed' | 'uncertain';
type DatSearchEquipmentType = 'Vans (Standard)' | 'Flatbeds (Standard)' | 'Reefers (Standard)';

export const DAT_SEARCH_LOADS_WORKFLOW_ID = 'fct-dat-search-loads-offers-v1';
export const DAT_SEARCH_LOADS_SCHEMA_VERSION = 1;

export interface DatRateViewRequest {
  requestId: string;
  origin: string;
  destination: string;
  equipmentType: DatEquipmentType;
}

export interface DatSearchLoadsRequest {
  workflowId: typeof DAT_SEARCH_LOADS_WORKFLOW_ID;
  schemaVersion: typeof DAT_SEARCH_LOADS_SCHEMA_VERSION;
  requestId: string;
  shipmentRecordId: string;
  searchFingerprint: string;
  origin: string;
  destination: string;
  equipmentType: DatSearchEquipmentType;
  pickupDate: string;
  originDeadheadMiles: 150;
  destinationDeadheadMiles: 150;
  loadType: 'Full & Partial';
  includeSimilarResults: false;
}

export interface DatLoadOffer {
  rank: number;
  datLoadId: string;
  sourceOrder: number;
  displayedTotal: string;
  totalUsd: number;
  rpm: string | null;
  tripMiles: string | null;
  origin: string | null;
  destination: string | null;
  originDeadhead: string | null;
  destinationDeadhead: string | null;
  pickup: string | null;
  equipmentCode: string | null;
  weight: string | null;
  lengthLoadType: string | null;
  company: string | null;
  creditScore: string | null;
  daysToPay: string | null;
  comments: string | null;
  commentsStatus: 'displayed' | 'not_displayed' | 'redacted';
}

export interface DatSearchLoadsResult {
  workflowId: typeof DAT_SEARCH_LOADS_WORKFLOW_ID;
  schemaVersion: typeof DAT_SEARCH_LOADS_SCHEMA_VERSION;
  requestId: string;
  shipmentRecordId: string;
  searchFingerprint: string;
  source: 'DAT Search Loads';
  searchTimestamp: string;
  acceptedCriteria: {
    origin: string;
    destination: string;
    equipmentType: DatSearchEquipmentType;
    pickupDate: string;
    originDeadheadMiles: 150;
    destinationDeadheadMiles: 150;
    loadType: 'Full & Partial';
    includeSimilarResults: false;
    sort: 'Rate - Highest';
  };
  directResultCount: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionReasons: Record<string, number>;
  duplicateCount: number;
  outcome: 'completed' | 'empty' | 'no_qualifying_offers';
  offers: DatLoadOffer[];
}

interface DatMarketRateCard {
  rateType: 'SPOT' | 'CONTRACT';
  acceptedMarketLane: string;
  averageTotalUsd: number;
  averagePerMileUsd: number | null;
  averagePerMileUnavailableReason: string | null;
  lowTotalUsd: number | null;
  highTotalUsd: number | null;
  lowPerMileUsd: number | null;
  highPerMileUsd: number | null;
  rangeUnavailableReason: string | null;
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

function searchLoadsEquipment(equipment: DatEquipmentType | null): DatSearchEquipmentType | null {
  if (equipment === 'Van') return 'Vans (Standard)';
  if (equipment === 'Flatbed') return 'Flatbeds (Standard)';
  if (equipment === 'Reefer') return 'Reefers (Standard)';
  return null;
}

function pickupCalendarDate(shipment: UnifiedQuoteRequest): string {
  const raw = cleanText(shipment.pickup && shipment.pickup.date);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (!match) return '';
  const parsed = new Date(`${match[1]}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]
    ? ''
    : match[1];
}

export function isDatSearchPickupDateCurrentOrFuture(
  pickupDate: string,
  now = new Date(),
  timezone = 'America/New_York'
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(function(part) {
    return [part.type, part.value];
  }));
  const today = `${values.year}-${values.month}-${values.day}`;
  return pickupDate >= today;
}

export function buildDatSearchLoadsRequest(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): { request: DatSearchLoadsRequest; fingerprint: string } | null {
  const origin = locationLabel(shipment.pickup && shipment.pickup.location);
  const destination = locationLabel(shipment.delivery && shipment.delivery.location);
  const equipmentType = searchLoadsEquipment(normalizeDatEquipment(shipment));
  const pickupDate = pickupCalendarDate(shipment);
  if (!origin || !destination || !equipmentType || !pickupDate) return null;
  const canonical = JSON.stringify({
    workflowId: DAT_SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: DAT_SEARCH_LOADS_SCHEMA_VERSION,
    shipmentRecordId: emailQuoteRequestId,
    origin: origin.toLowerCase(),
    destination: destination.toLowerCase(),
    equipmentType: equipmentType.toLowerCase(),
    pickupDate,
    originDeadheadMiles: 150,
    destinationDeadheadMiles: 150,
    loadType: 'full & partial',
    includeSimilarResults: false
  });
  const fingerprint = crypto.createHash('sha256').update(canonical).digest('hex');
  return {
    fingerprint,
    request: {
      workflowId: DAT_SEARCH_LOADS_WORKFLOW_ID,
      schemaVersion: DAT_SEARCH_LOADS_SCHEMA_VERSION,
      requestId: `${emailQuoteRequestId}:search-loads:${fingerprint.slice(0, 16)}`,
      shipmentRecordId: emailQuoteRequestId,
      searchFingerprint: fingerprint,
      origin,
      destination,
      equipmentType,
      pickupDate,
      originDeadheadMiles: 150,
      destinationDeadheadMiles: 150,
      loadType: 'Full & Partial',
      includeSimilarResults: false
    }
  };
}

export async function cancelStalePendingDatJobs(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): Promise<void> {
  const rateView = buildDatRateViewRequest(emailQuoteRequestId, shipment);
  const searchLoads = buildDatSearchLoadsRequest(emailQuoteRequestId, shipment);
  await db.query(
    `UPDATE public.dat_rateview_jobs
     SET status = 'cancelled'
     WHERE email_quote_request_id = $1
       AND status = 'pending'
       AND (
         (
           input_payload->>'workflowId' = $2
           AND ($3::text IS NULL OR request_fingerprint <> $3)
         )
         OR
         (
           COALESCE(input_payload->>'workflowId', '') <> $2
           AND ($4::text IS NULL OR request_fingerprint <> $4)
         )
       )`,
    [
      emailQuoteRequestId,
      DAT_SEARCH_LOADS_WORKFLOW_ID,
      searchLoads ? searchLoads.fingerprint : null,
      rateView ? rateView.fingerprint : null
    ]
  );
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

function datSearchLoadsPlaceholder(status: string, error: string): CarrierQuoteOption {
  return {
    key: 'datLoadOffers',
    source: 'DAT Search Loads',
    available: false,
    selectable: false,
    benchmark: true,
    status,
    error,
    offers: []
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
    ...(card.lowTotalUsd == null ? {} : { marketLow: card.lowTotalUsd }),
    ...(card.highTotalUsd == null ? {} : { marketHigh: card.highTotalUsd }),
    ...(card.rangeUnavailableReason
      ? { marketRangeUnavailableReason: card.rangeUnavailableReason }
      : {}),
    ...(card.averagePerMileUsd == null ? {} : { ratePerMile: card.averagePerMileUsd }),
    ...(card.lowPerMileUsd == null ? {} : { lowRatePerMile: card.lowPerMileUsd }),
    ...(card.highPerMileUsd == null ? {} : { highRatePerMile: card.highPerMileUsd }),
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
    averagePerMileUsd: value.averagePerMileUsd == null
      ? null
      : Number(value.averagePerMileUsd),
    averagePerMileUnavailableReason: value.averagePerMileUnavailableReason == null
      ? null
      : cleanText(value.averagePerMileUnavailableReason).slice(0, 200),
    lowTotalUsd: value.lowTotalUsd == null ? null : Number(value.lowTotalUsd),
    highTotalUsd: value.highTotalUsd == null ? null : Number(value.highTotalUsd),
    lowPerMileUsd: value.lowPerMileUsd == null ? null : Number(value.lowPerMileUsd),
    highPerMileUsd: value.highPerMileUsd == null ? null : Number(value.highPerMileUsd),
    rangeUnavailableReason: value.rangeUnavailableReason == null
      ? null
      : cleanText(value.rangeUnavailableReason).slice(0, 200),
    miles: Number(value.miles),
    timeframe: cleanText(value.timeframe)
  };
  const numericValues = [
    card.averageTotalUsd,
    card.miles
  ];
  if (!card.acceptedMarketLane || !card.timeframe || numericValues.some(function(number) {
    return !Number.isFinite(number) || number <= 0;
  })) {
    throw new Error(`DAT ${expected.toLowerCase()} result is invalid`);
  }
  if (
    (card.averagePerMileUsd != null && (
      !Number.isFinite(card.averagePerMileUsd) || card.averagePerMileUsd <= 0
    )) ||
    (card.averagePerMileUsd == null && !card.averagePerMileUnavailableReason) ||
    (card.averagePerMileUsd != null && card.averagePerMileUnavailableReason)
  ) {
    throw new Error(`DAT ${expected.toLowerCase()} average per-mile result is invalid`);
  }
  const totalRangePresent = card.lowTotalUsd != null && card.highTotalUsd != null;
  const perMileRangePresent = card.lowPerMileUsd != null && card.highPerMileUsd != null;
  const totalRangePartial = (card.lowTotalUsd == null) !== (card.highTotalUsd == null);
  const perMileRangePartial = (card.lowPerMileUsd == null) !== (card.highPerMileUsd == null);
  const optionalValues = [
    card.lowTotalUsd,
    card.highTotalUsd,
    card.lowPerMileUsd,
    card.highPerMileUsd
  ];
  if (totalRangePartial || perMileRangePartial || optionalValues.some(function(number) {
    return number != null && (!Number.isFinite(number) || number <= 0);
  })) {
    throw new Error(`DAT ${expected.toLowerCase()} range is invalid`);
  }
  if ((!totalRangePresent || !perMileRangePresent) && !card.rangeUnavailableReason) {
    throw new Error(`DAT ${expected.toLowerCase()} unavailable range reason is missing`);
  }
  if (
    (totalRangePresent && (
      (card.lowTotalUsd as number) > card.averageTotalUsd ||
      card.averageTotalUsd > (card.highTotalUsd as number)
    )) ||
    (perMileRangePresent && card.averagePerMileUsd != null && (
      (card.lowPerMileUsd as number) > card.averagePerMileUsd ||
      card.averagePerMileUsd > (card.highPerMileUsd as number)
    ))
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

const CONTACT_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CONTACT_PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;
const CONTACT_LINK_PATTERN = /(?:mailto:|tel:|https?:\/\/\S*(?:contact|phone|call|email))/i;

function safeOptionalText(value: any, field: string): string | null {
  if (value == null || value === '') return null;
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  if (
    CONTACT_EMAIL_PATTERN.test(cleaned) ||
    CONTACT_PHONE_PATTERN.test(cleaned) ||
    CONTACT_LINK_PATTERN.test(cleaned)
  ) {
    throw new Error(`DAT Search Loads ${field} contains prohibited contact data`);
  }
  return cleaned.slice(0, 1000);
}

function nonNegativeInteger(value: any, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`DAT Search Loads ${field} is invalid`);
  }
  return parsed;
}

function validateSearchCriteria(value: any): DatSearchLoadsResult['acceptedCriteria'] {
  if (!value || value.originDeadheadMiles !== 150 || value.destinationDeadheadMiles !== 150 ||
      value.loadType !== 'Full & Partial' || value.includeSimilarResults !== false ||
      value.sort !== 'Rate - Highest') {
    throw new Error('DAT Search Loads accepted criteria are invalid');
  }
  const equipmentType = cleanText(value.equipmentType) as DatSearchEquipmentType;
  if (['Vans (Standard)', 'Flatbeds (Standard)', 'Reefers (Standard)'].indexOf(equipmentType) < 0) {
    throw new Error('DAT Search Loads equipment is invalid');
  }
  const pickupDate = cleanText(value.pickupDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    throw new Error('DAT Search Loads pickup date is invalid');
  }
  const criteria: DatSearchLoadsResult['acceptedCriteria'] = {
    origin: cleanText(value.origin),
    destination: cleanText(value.destination),
    equipmentType,
    pickupDate,
    originDeadheadMiles: 150,
    destinationDeadheadMiles: 150,
    loadType: 'Full & Partial',
    includeSimilarResults: false,
    sort: 'Rate - Highest'
  };
  if (!criteria.origin || !criteria.destination) {
    throw new Error('DAT Search Loads accepted lane is incomplete');
  }
  return criteria;
}

function validateLoadOffer(value: any, expectedRank: number): DatLoadOffer {
  const totalUsd = Number(value && value.totalUsd);
  const sourceOrder = Number(value && value.sourceOrder);
  const displayedTotal = cleanText(value && value.displayedTotal);
  const parsedDisplayedTotal = /^\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?$|^\$\d+(?:\.\d{2})?$/.test(displayedTotal)
    ? Number(displayedTotal.replace(/[$,]/g, ''))
    : NaN;
  if (
    !value || Number(value.rank) !== expectedRank ||
    !Number.isSafeInteger(sourceOrder) || sourceOrder < 0 ||
    !Number.isFinite(totalUsd) || totalUsd <= 0 ||
    !Number.isFinite(parsedDisplayedTotal) || parsedDisplayedTotal <= 0 ||
    Math.abs(parsedDisplayedTotal - totalUsd) >= 0.005
  ) {
    throw new Error('DAT Search Loads ranked offer is invalid');
  }
  const commentsStatus = cleanText(value.commentsStatus) as DatLoadOffer['commentsStatus'];
  if (['displayed', 'not_displayed', 'redacted'].indexOf(commentsStatus) < 0) {
    throw new Error('DAT Search Loads comments status is invalid');
  }
  const comments = safeOptionalText(value.comments, 'comments');
  if (commentsStatus === 'not_displayed' && comments !== null) {
    throw new Error('DAT Search Loads comments must be null when not displayed');
  }
  const datLoadId = cleanText(value.datLoadId);
  if (!/^table-row-(?!similar-matches-separator)[A-Za-z0-9_-]+$/.test(datLoadId)) {
    throw new Error('DAT Search Loads stable row ID is invalid');
  }
  return {
    rank: expectedRank,
    datLoadId,
    sourceOrder,
    displayedTotal,
    totalUsd,
    rpm: safeOptionalText(value.rpm, 'RPM'),
    tripMiles: safeOptionalText(value.tripMiles, 'trip miles'),
    origin: safeOptionalText(value.origin, 'origin'),
    destination: safeOptionalText(value.destination, 'destination'),
    originDeadhead: safeOptionalText(value.originDeadhead, 'origin deadhead'),
    destinationDeadhead: safeOptionalText(value.destinationDeadhead, 'destination deadhead'),
    pickup: safeOptionalText(value.pickup, 'pickup'),
    equipmentCode: safeOptionalText(value.equipmentCode, 'equipment'),
    weight: safeOptionalText(value.weight, 'weight'),
    lengthLoadType: safeOptionalText(value.lengthLoadType, 'length/load type'),
    company: safeOptionalText(value.company, 'company'),
    creditScore: safeOptionalText(value.creditScore, 'credit score'),
    daysToPay: safeOptionalText(value.daysToPay, 'days to pay'),
    comments,
    commentsStatus
  };
}

export function validateDatSearchLoadsResult(value: any): DatSearchLoadsResult {
  if (!value || value.workflowId !== DAT_SEARCH_LOADS_WORKFLOW_ID ||
      value.schemaVersion !== DAT_SEARCH_LOADS_SCHEMA_VERSION ||
      value.source !== 'DAT Search Loads') {
    throw new Error('DAT Search Loads result identity is invalid');
  }
  const offers = Array.isArray(value.offers)
    ? value.offers.map(function(offer: any, index: number) {
      return validateLoadOffer(offer, index + 1);
    })
    : [];
  if (offers.length > 10) throw new Error('DAT Search Loads returned more than 10 offers');
  const offerIds = new Set<string>();
  for (let index = 1; index < offers.length; index += 1) {
    if (offers[index - 1].totalUsd < offers[index].totalUsd) {
      throw new Error('DAT Search Loads offers are not sorted by total rate descending');
    }
    if (
      offers[index - 1].totalUsd === offers[index].totalUsd &&
      offers[index - 1].sourceOrder > offers[index].sourceOrder
    ) {
      throw new Error('DAT Search Loads equal-rate offers do not preserve source order');
    }
  }
  offers.forEach(function(offer) {
    if (offerIds.has(offer.datLoadId)) {
      throw new Error('DAT Search Loads ranked offers contain duplicate row IDs');
    }
    offerIds.add(offer.datLoadId);
  });
  const exclusionReasons: Record<string, number> = {};
  if (!value.exclusionReasons || typeof value.exclusionReasons !== 'object' || Array.isArray(value.exclusionReasons)) {
    throw new Error('DAT Search Loads exclusion reasons are invalid');
  }
  Object.keys(value.exclusionReasons).forEach(function(reason) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(reason)) {
      throw new Error('DAT Search Loads exclusion reason is invalid');
    }
    exclusionReasons[reason] = nonNegativeInteger(value.exclusionReasons[reason], reason);
  });
  const directResultCount = nonNegativeInteger(value.directResultCount, 'direct result count');
  const eligibleCount = nonNegativeInteger(value.eligibleCount, 'eligible count');
  const excludedCount = nonNegativeInteger(value.excludedCount, 'excluded count');
  const duplicateCount = nonNegativeInteger(value.duplicateCount, 'duplicate count');
  const reasonTotal = Object.values(exclusionReasons).reduce(function(sum, count) { return sum + count; }, 0);
  if (eligibleCount + excludedCount !== directResultCount || reasonTotal !== excludedCount ||
      offers.length !== Math.min(10, eligibleCount) ||
      duplicateCount !== Number(exclusionReasons.DUPLICATE_STABLE_DAT_LOAD_ID || 0)) {
    throw new Error('DAT Search Loads row accounting is inconsistent');
  }
  const outcome = cleanText(value.outcome) as DatSearchLoadsResult['outcome'];
  if (['completed', 'empty', 'no_qualifying_offers'].indexOf(outcome) < 0 ||
      (outcome === 'empty' && directResultCount !== 0) ||
      (outcome === 'no_qualifying_offers' && eligibleCount !== 0)) {
    throw new Error('DAT Search Loads outcome is inconsistent');
  }
  const timestamp = new Date(value.searchTimestamp);
  if (Number.isNaN(timestamp.getTime())) throw new Error('DAT Search Loads timestamp is invalid');
  const result: DatSearchLoadsResult = {
    workflowId: DAT_SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: DAT_SEARCH_LOADS_SCHEMA_VERSION,
    requestId: cleanText(value.requestId),
    shipmentRecordId: cleanText(value.shipmentRecordId),
    searchFingerprint: cleanText(value.searchFingerprint),
    source: 'DAT Search Loads',
    searchTimestamp: timestamp.toISOString(),
    acceptedCriteria: validateSearchCriteria(value.acceptedCriteria),
    directResultCount,
    eligibleCount,
    excludedCount,
    exclusionReasons,
    duplicateCount,
    outcome,
    offers
  };
  if (!result.requestId || !result.shipmentRecordId || !/^[a-f0-9]{64}$/.test(result.searchFingerprint)) {
    throw new Error('DAT Search Loads request identity is incomplete');
  }
  return result;
}

export function mapDatSearchLoadsResult(result: DatSearchLoadsResult): CarrierQuoteOption {
  return {
    key: 'datLoadOffers',
    source: 'DAT Search Loads',
    available: true,
    selectable: false,
    benchmark: true,
    status: 'completed',
    searchFingerprint: result.searchFingerprint,
    acceptedCriteria: result.acceptedCriteria,
    lookupTimestamp: result.searchTimestamp,
    offers: result.offers,
    resultCount: result.directResultCount,
    eligibleCount: result.eligibleCount,
    excludedCount: result.excludedCount,
    exclusionReasons: result.exclusionReasons,
    outcome: result.outcome
  };
}

function placeholderForJobStatus(status: string, message?: string | null): CarrierQuoteOption {
  if (status === 'pending') {
    return datPlaceholder('pending', 'Queued automatically and waiting for the DAT worker.');
  }
  if (status === 'claimed' || status === 'running') {
    return datPlaceholder('running', 'The DAT worker is checking this lane now.');
  }
  if (status === 'needs_auth') {
    return datPlaceholder('needs_auth', 'DAT sign-in is required on the worker. Sign in, then retry this lane.');
  }
  if (status === 'uncertain') {
    return datPlaceholder('uncertain', 'DAT submission outcome is uncertain. Reconcile this lookup before trying again.');
  }
  if (status === 'failed') {
    return datPlaceholder('failed', 'DAT did not return a usable market rate. Review the worker log, then retry only if no search was submitted.');
  }
  return datPlaceholder('awaiting_approval', 'DAT pricing will queue automatically after the shipment is complete.');
}

function searchLoadsPlaceholderForJobStatus(status: string): CarrierQuoteOption {
  if (status === 'pending') {
    return datSearchLoadsPlaceholder('pending', 'Queued automatically and waiting for the DAT worker.');
  }
  if (status === 'claimed' || status === 'running') {
    return datSearchLoadsPlaceholder('running', 'The DAT worker is reading direct Search Loads results.');
  }
  if (status === 'needs_auth') {
    return datSearchLoadsPlaceholder('needs_auth', 'DAT sign-in is required on the worker. Sign in, then retry this exact search.');
  }
  if (status === 'uncertain') {
    return datSearchLoadsPlaceholder('uncertain', 'The DAT search outcome is uncertain and cannot be submitted again automatically.');
  }
  if (status === 'failed') {
    return datSearchLoadsPlaceholder('failed', 'DAT Search Loads did not return a verified direct-result set.');
  }
  return datSearchLoadsPlaceholder('awaiting_approval', 'Search Loads will queue automatically after the shipment is complete.');
}

async function prepareExistingSearchLoadsOption(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): Promise<CarrierQuoteOption[]> {
  const candidate = buildDatSearchLoadsRequest(emailQuoteRequestId, shipment);
  if (!candidate) return [];
  const prior = await db.query(
    `SELECT status, result_payload
     FROM public.dat_rateview_jobs
     WHERE email_quote_request_id = $1 AND request_fingerprint = $2`,
    [emailQuoteRequestId, candidate.fingerprint]
  );
  if (!prior.rows.length) return [];
  const job = prior.rows[0];
  if (job.status === 'completed' && job.result_payload) {
    return [mapDatSearchLoadsResult(validateDatSearchLoadsResult(jsonValue(job.result_payload, null)))];
  }
  return [searchLoadsPlaceholderForJobStatus(job.status)];
}

export async function prepareDatRateViewOptions(
  emailQuoteRequestId: string,
  shipment: UnifiedQuoteRequest
): Promise<CarrierQuoteOption[]> {
  await cancelStalePendingDatJobs(emailQuoteRequestId, shipment);
  const searchLoadsOptions = await prepareExistingSearchLoadsOption(emailQuoteRequestId, shipment);
  if (!isDatWorkerEnabled()) {
    return [datPlaceholder('disabled', 'DAT worker is not enabled on the server.')].concat(searchLoadsOptions);
  }
  const candidate = buildDatRateViewRequest(emailQuoteRequestId, shipment);
  if (!candidate) {
    return [datPlaceholder('needs_equipment', 'Choose Van, Flatbed, or Reefer to prepare DAT RateView.')].concat(searchLoadsOptions);
  }
  const prior = await db.query(
    `SELECT status, result_payload, error_message
     FROM public.dat_rateview_jobs
     WHERE email_quote_request_id = $1 AND request_fingerprint = $2`,
    [emailQuoteRequestId, candidate.fingerprint]
  );
  if (!prior.rows.length) {
    return [placeholderForJobStatus('awaiting_approval')].concat(searchLoadsOptions);
  }
  const job = prior.rows[0];
  if (job.status === 'completed' && job.result_payload) {
    return mapDatRateViewResult(validateDatRateViewResult(jsonValue(job.result_payload, null))).concat(searchLoadsOptions);
  }
  return [placeholderForJobStatus(job.status, job.error_message)].concat(searchLoadsOptions);
}

export async function requestDatRateViewLookup(
  emailQuoteRequestId: string,
  approvedBy: string | null,
  options: { automatic?: boolean } = {}
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
    } else if (
      job.status === 'cancelled' ||
      (!options.automatic && ['needs_auth', 'failed'].indexOf(job.status) > -1)
    ) {
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

export async function requestDatSearchLoadsLookup(
  emailQuoteRequestId: string,
  approvedBy: string | null,
  options: { automatic?: boolean } = {}
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
    if (!options.automatic && ['ready', 'priced', 'sent'].indexOf(String(quote.status)) < 0) {
      const err: any = new Error('Save a complete shipment before Search Loads');
      err.status = 409;
      throw err;
    }
    const shipment = jsonValue(quote.shipment_request, {});
    const savedPickupDate = pickupCalendarDate(shipment);
    if (savedPickupDate && !isDatSearchPickupDateCurrentOrFuture(savedPickupDate)) {
      const err: any = new Error('Search Loads pickup date cannot be in the past. Update and save the shipment first');
      err.status = 400;
      throw err;
    }
    const candidate = buildDatSearchLoadsRequest(emailQuoteRequestId, shipment);
    if (!candidate) {
      const err: any = new Error('Search Loads requires saved origin, destination, pickup date, and DAT equipment');
      err.status = 400;
      throw err;
    }
    await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'cancelled'
       WHERE email_quote_request_id = $1
         AND request_fingerprint <> $2
         AND status = 'pending'
         AND input_payload->>'workflowId' = $3`,
      [emailQuoteRequestId, candidate.fingerprint, DAT_SEARCH_LOADS_WORKFLOW_ID]
    );
    const existing = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE email_quote_request_id = $1 AND request_fingerprint = $2
       FOR UPDATE`,
      [emailQuoteRequestId, candidate.fingerprint]
    );
    let job = existing.rows[0];
    if (job && job.status === 'uncertain') {
      const err: any = new Error('This Search Loads query is uncertain and must be reconciled before resubmission');
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
          `dat-search-job-${crypto.randomUUID()}`,
          emailQuoteRequestId,
          candidate.fingerprint,
          JSON.stringify(candidate.request),
          approvedBy
        ]
      );
      job = inserted.rows[0];
    } else if (
      job.status === 'cancelled' ||
      (!options.automatic && ['needs_auth', 'failed'].indexOf(job.status) > -1)
    ) {
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
    const searchOption = job.status === 'completed' && job.result_payload
      ? mapDatSearchLoadsResult(validateDatSearchLoadsResult(jsonValue(job.result_payload, null)))
      : searchLoadsPlaceholderForJobStatus(job.status);
    const updated = await client.query(
      `UPDATE public.email_quote_requests
       SET carrier_quotes = $2::jsonb
       WHERE id = $1
       RETURNING *`,
      [emailQuoteRequestId, JSON.stringify(mergeDatCarrierOptions(currentOptions, [searchOption]))]
    );
    return updated.rows[0];
  }, approvedBy);
}

function isProtectedUncertainConflict(err: any): boolean {
  return Number(err && err.status) === 409 && /uncertain/i.test(String(err && err.message || ''));
}

export async function requestDatLookups(
  emailQuoteRequestId: string,
  approvedBy: string
): Promise<any> {
  let latest: any | null = null;
  const blockingErrors: any[] = [];
  const protectedConflicts: any[] = [];

  try {
    latest = await requestDatRateViewLookup(emailQuoteRequestId, approvedBy);
  } catch (err) {
    if (isProtectedUncertainConflict(err)) protectedConflicts.push(err);
    else blockingErrors.push(err);
  }

  try {
    latest = await requestDatSearchLoadsLookup(emailQuoteRequestId, approvedBy);
  } catch (err) {
    if (isProtectedUncertainConflict(err)) protectedConflicts.push(err);
    else blockingErrors.push(err);
  }

  if (blockingErrors.length) throw blockingErrors[0];
  if (latest) return latest;
  if (protectedConflicts.length) throw protectedConflicts[0];
  const err: any = new Error('No DAT lookup could be queued');
  err.status = 409;
  throw err;
}

export async function queueAutomaticDatLookups(
  emailQuoteRequestId: string
): Promise<any | null> {
  if (!isDatWorkerEnabled()) return null;

  let latest: any | null = null;
  try {
    latest = await requestDatRateViewLookup(emailQuoteRequestId, null, { automatic: true });
  } catch (err: any) {
    // Connected-carrier pricing must remain usable when a DAT queue is unavailable.
    console.error('Automatic DAT RateView queue failed:', err && err.message ? err.message : err);
  }

  try {
    latest = await requestDatSearchLoadsLookup(emailQuoteRequestId, null, { automatic: true });
  } catch (err: any) {
    // Queue each read-only DAT workflow independently so one failure does not hide the other.
    console.error('Automatic DAT Search Loads queue failed:', err && err.message ? err.message : err);
  }
  return latest;
}

export async function claimDatRateViewJob(workerId: string): Promise<any | null> {
  return db.transactionWithUser(async function(client) {
    await client.query(
      `INSERT INTO public.dat_worker_heartbeats (
         worker_id, last_seen_at, last_successful_poll_at, updated_at
       ) VALUES ($1, NOW(), NOW(), NOW())
       ON CONFLICT (worker_id) DO UPDATE SET
         last_seen_at = NOW(),
         last_successful_poll_at = NOW(),
         updated_at = NOW()`,
      [workerId]
    );
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
    const resumable = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE worker_id = $1
         AND status = 'claimed'
         AND started_at IS NULL
       ORDER BY claimed_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [workerId]
    );
    if (resumable.rows.length) {
      const renewed = await client.query(
        `UPDATE public.dat_rateview_jobs
         SET claimed_at = NOW()
         WHERE id = $1 AND worker_id = $2
           AND status = 'claimed' AND started_at IS NULL
         RETURNING *`,
        [resumable.rows[0].id, workerId]
      );
      if (renewed.rows.length) return datWorkerJobPayload(renewed.rows[0]);
    }
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
    return datWorkerJobPayload(job);
  });
}

function datWorkerJobPayload(job: any): any {
  return {
    id: job.id,
    request: jsonValue(job.input_payload, {}),
    approvedAt: job.approved_at,
    attemptCount: job.attempt_count
  };
}

export async function startDatRateViewJob(id: string, workerId: string): Promise<void> {
  await db.transactionWithUser(async function(client) {
    const current = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE id = $1 AND worker_id = $2
       FOR UPDATE`,
      [id, workerId]
    );
    if (!current.rows.length) {
      const err: any = new Error('DAT job is not claimed by this worker');
      err.status = 409;
      throw err;
    }
    if (current.rows[0].status === 'running') {
      await client.query(
        `UPDATE public.dat_worker_heartbeats
         SET last_seen_at = NOW(), last_job_at = NOW(), active_job_id = $2,
             last_error_category = NULL, updated_at = NOW()
         WHERE worker_id = $1`,
        [workerId, id]
      );
      return;
    }
    if (current.rows[0].status !== 'claimed') {
      const err: any = new Error('DAT job is not claimed by this worker');
      err.status = 409;
      throw err;
    }
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
    await client.query(
      `UPDATE public.dat_worker_heartbeats
       SET last_seen_at = NOW(), last_job_at = NOW(), active_job_id = $2,
           last_error_category = NULL, updated_at = NOW()
       WHERE worker_id = $1`,
      [workerId, id]
    );
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
  const input = jsonValue(job.input_payload, {});
  const isSearchLoads = input.workflowId === DAT_SEARCH_LOADS_WORKFLOW_ID;
  const effectiveOption = isSearchLoads && option.key !== 'datLoadOffers'
    ? searchLoadsPlaceholderForJobStatus(option.status || 'failed')
    : option;
  const candidate = isSearchLoads
    ? buildDatSearchLoadsRequest(job.email_quote_request_id, jsonValue(quote.shipment_request, {}))
    : buildDatRateViewRequest(job.email_quote_request_id, jsonValue(quote.shipment_request, {}));
  if (!candidate || candidate.fingerprint !== job.request_fingerprint) return;
  const options: CarrierQuoteOption[] = jsonValue(quote.carrier_quotes, []);
  await client.query(
    `UPDATE public.email_quote_requests SET carrier_quotes = $2::jsonb WHERE id = $1`,
    [job.email_quote_request_id, JSON.stringify(mergeDatCarrierOptions(options, [effectiveOption]))]
  );
}

export async function completeDatRateViewJob(
  id: string,
  workerId: string,
  rawResult: any
): Promise<void> {
  await db.transactionWithUser(async function(client) {
    const current = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE id = $1 AND worker_id = $2
       FOR UPDATE`,
      [id, workerId]
    );
    if (!current.rows.length) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    const currentJob = current.rows[0];
    const input: DatRateViewRequest | DatSearchLoadsRequest = jsonValue(currentJob.input_payload, {});
    const isSearchLoads = (input as DatSearchLoadsRequest).workflowId === DAT_SEARCH_LOADS_WORKFLOW_ID;
    const result = isSearchLoads
      ? validateDatSearchLoadsResult(rawResult)
      : validateDatRateViewResult(rawResult);
    if (isSearchLoads) {
      const searchInput = input as DatSearchLoadsRequest;
      const searchResult = result as DatSearchLoadsResult;
      if (
        searchResult.requestId !== searchInput.requestId ||
        searchResult.shipmentRecordId !== searchInput.shipmentRecordId ||
        searchResult.searchFingerprint !== currentJob.request_fingerprint ||
        cleanText(searchResult.acceptedCriteria.origin).toLowerCase() !== cleanText(searchInput.origin).toLowerCase() ||
        cleanText(searchResult.acceptedCriteria.destination).toLowerCase() !== cleanText(searchInput.destination).toLowerCase() ||
        searchResult.acceptedCriteria.equipmentType !== searchInput.equipmentType ||
        searchResult.acceptedCriteria.pickupDate !== searchInput.pickupDate
      ) {
        const err: any = new Error('DAT Search Loads result does not match the claimed request');
        err.status = 400;
        throw err;
      }
    } else {
      const rateInput = input as DatRateViewRequest;
      const rateResult = result as DatRateViewResult;
      if (
        rateResult.requestId !== rateInput.requestId ||
        cleanText(rateResult.acceptedOrigin).toLowerCase() !== cleanText(rateInput.origin).toLowerCase() ||
        cleanText(rateResult.acceptedDestination).toLowerCase() !== cleanText(rateInput.destination).toLowerCase() ||
        rateResult.acceptedEquipmentType !== rateInput.equipmentType
      ) {
        const err: any = new Error('DAT result does not match the claimed request');
        err.status = 400;
        throw err;
      }
    }
    if (currentJob.status === 'completed') {
      if (isDeepStrictEqual(jsonValue(currentJob.result_payload, null), result)) {
        await client.query(
          `UPDATE public.dat_worker_heartbeats
           SET last_seen_at = NOW(), active_job_id = NULL,
               last_error_category = NULL, updated_at = NOW()
           WHERE worker_id = $1`,
          [workerId]
        );
        return;
      }
      const err: any = new Error('DAT job is already completed with a different result');
      err.status = 409;
      throw err;
    }
    if (['claimed', 'running'].indexOf(currentJob.status) === -1) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    const updated = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = 'completed', result_payload = $3::jsonb,
           error_category = NULL, error_message = NULL, completed_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status IN ('claimed', 'running')
       RETURNING *`,
      [id, workerId, JSON.stringify(result)]
    );
    await client.query(
      `UPDATE public.dat_worker_heartbeats
       SET last_seen_at = NOW(), active_job_id = NULL,
           last_error_category = NULL, updated_at = NOW()
       WHERE worker_id = $1`,
      [workerId]
    );
    const quoteResult = await client.query(
      `SELECT shipment_request, carrier_quotes
       FROM public.email_quote_requests WHERE id = $1 FOR UPDATE`,
      [updated.rows[0].email_quote_request_id]
    );
    if (!quoteResult.rows.length) return;
    const quote = quoteResult.rows[0];
    const candidate = isSearchLoads
      ? buildDatSearchLoadsRequest(updated.rows[0].email_quote_request_id, jsonValue(quote.shipment_request, {}))
      : buildDatRateViewRequest(updated.rows[0].email_quote_request_id, jsonValue(quote.shipment_request, {}));
    if (!candidate || candidate.fingerprint !== updated.rows[0].request_fingerprint) return;
    const options: CarrierQuoteOption[] = jsonValue(quote.carrier_quotes, []);
    const datOptions = isSearchLoads
      ? [mapDatSearchLoadsResult(result as DatSearchLoadsResult)]
      : mapDatRateViewResult(result as DatRateViewResult);
    await client.query(
      `UPDATE public.email_quote_requests SET carrier_quotes = $2::jsonb WHERE id = $1`,
      [
        updated.rows[0].email_quote_request_id,
        JSON.stringify(mergeDatCarrierOptions(options, datOptions))
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
    const cleanedCategory = cleanText(category).slice(0, 100);
    const cleanedMessage = cleanText(message).slice(0, 500);
    const current = await client.query(
      `SELECT * FROM public.dat_rateview_jobs
       WHERE id = $1 AND worker_id = $2
       FOR UPDATE`,
      [id, workerId]
    );
    if (!current.rows.length) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    const currentJob = current.rows[0];
    if (
      currentJob.status === state &&
      cleanText(currentJob.error_category) === cleanedCategory &&
      cleanText(currentJob.error_message) === cleanedMessage
    ) {
      await client.query(
        `UPDATE public.dat_worker_heartbeats
         SET last_seen_at = NOW(), active_job_id = NULL,
             last_error_category = $2, updated_at = NOW()
         WHERE worker_id = $1`,
        [workerId, cleanedCategory]
      );
      return;
    }
    if (['claimed', 'running'].indexOf(currentJob.status) === -1) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    const updated = await client.query(
      `UPDATE public.dat_rateview_jobs
       SET status = $3, error_category = $4, error_message = $5,
           completed_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status IN ('claimed', 'running')
       RETURNING *`,
      [id, workerId, state, cleanedCategory, cleanedMessage]
    );
    if (!updated.rows.length) {
      const err: any = new Error('DAT job is not active for this worker');
      err.status = 409;
      throw err;
    }
    await client.query(
      `UPDATE public.dat_worker_heartbeats
       SET last_seen_at = NOW(), active_job_id = NULL,
           last_error_category = $2, updated_at = NOW()
       WHERE worker_id = $1`,
      [workerId, cleanedCategory]
    );
    const input = jsonValue(updated.rows[0].input_payload, {});
    const placeholder = input.workflowId === DAT_SEARCH_LOADS_WORKFLOW_ID
      ? searchLoadsPlaceholderForJobStatus(state)
      : placeholderForJobStatus(state, message);
    await updateQuoteDatPlaceholder(
      client,
      updated.rows[0],
      placeholder
    );
  });
}

export async function getDatWorkerStatus(): Promise<any> {
  const [result, heartbeatResult] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
         COUNT(*) FILTER (WHERE status IN ('claimed', 'running'))::integer AS active,
         COUNT(*) FILTER (WHERE status = 'needs_auth')::integer AS needs_auth,
         COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed,
         COUNT(*) FILTER (WHERE status = 'uncertain')::integer AS uncertain,
         MAX(completed_at) FILTER (WHERE status = 'completed') AS last_completed_at
       FROM public.dat_rateview_jobs`
    ),
    db.query(
      `SELECT worker_id, last_seen_at, last_successful_poll_at, last_job_at,
              active_job_id, last_error_category
       FROM public.dat_worker_heartbeats
       ORDER BY last_seen_at DESC
       LIMIT 1`
    )
  ]);
  const enabled = isDatWorkerEnabled();
  const configured = Boolean(String(process.env.DAT_WORKER_SECRET || '').trim());
  const heartbeat = heartbeatResult.rows[0] || null;
  const staleAfterRaw = Number(process.env.DAT_WORKER_STALE_MS || 90000);
  const staleAfterMs = Number.isFinite(staleAfterRaw) && staleAfterRaw >= 15000
    ? staleAfterRaw
    : 90000;
  const lastSeenMs = heartbeat && heartbeat.last_seen_at
    ? new Date(heartbeat.last_seen_at).getTime()
    : 0;
  const staleForMs = lastSeenMs ? Math.max(0, Date.now() - lastSeenMs) : null;
  const needsAuth = Number(result.rows[0].needs_auth || 0);
  const active = Number(result.rows[0].active || 0);
  let state = 'online';
  if (!enabled) state = 'disabled';
  else if (!configured) state = 'misconfigured';
  else if (needsAuth > 0 || (heartbeat && heartbeat.last_error_category === 'AUTH_REQUIRED')) state = 'needs_auth';
  else if (!heartbeat || staleForMs == null || staleForMs > staleAfterMs) state = 'offline';
  else if (active > 0 || heartbeat.active_job_id) state = 'working';
  return {
    enabled,
    configured,
    state,
    pending: Number(result.rows[0].pending || 0),
    active,
    needsAuth,
    failed: Number(result.rows[0].failed || 0),
    uncertain: Number(result.rows[0].uncertain || 0),
    lastCompletedAt: result.rows[0].last_completed_at || null,
    worker: heartbeat ? {
      id: heartbeat.worker_id,
      lastSeenAt: heartbeat.last_seen_at,
      lastSuccessfulPollAt: heartbeat.last_successful_poll_at,
      lastJobAt: heartbeat.last_job_at,
      activeJob: Boolean(heartbeat.active_job_id),
      lastErrorCategory: heartbeat.last_error_category,
      staleForMs,
      staleAfterMs
    } : null
  };
}
