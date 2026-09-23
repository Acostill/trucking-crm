export type CarrierQuoteKey =
  | 'expediteAll'
  | 'forwardAir'
  | 'datRateView'
  | 'datSpot'
  | 'datContract'
  | 'datLoadOffers'
  | 'rateTable'
  | 'laneHistory';

export interface CarrierQuoteOption {
  key: CarrierQuoteKey;
  source: string;
  available: boolean;
  selectable?: boolean;
  benchmark?: boolean;
  status?: string;
  cost?: number;
  lineHaul?: number;
  ratePerMile?: number;
  truckType?: string;
  transitTime?: number;
  rateCalculationId?: string;
  accessorials?: any[];
  error?: string;
  marketLow?: number;
  marketAverage?: number;
  marketHigh?: number;
  marketRangeUnavailableReason?: string;
  lowRatePerMile?: number;
  highRatePerMile?: number;
  miles?: number;
  timeframe?: string;
  lookupTimestamp?: string;
  acceptedMarketLane?: string;
  searchFingerprint?: string;
  acceptedCriteria?: any;
  offers?: any[];
  resultCount?: number;
  eligibleCount?: number;
  excludedCount?: number;
  exclusionReasons?: Record<string, number>;
  outcome?: string;
  // Market-first pricing metadata.
  pricingBasis?: 'carrier_rate' | 'market_estimate' | 'rate_table';
  requestFingerprint?: string;
  fromCache?: boolean;
  cachedAt?: string;
  mileageMethod?: string;
  note?: string;
}

/**
 * A price staff can build a customer quote from. DAT spot and the rate table
 * are estimates of the truck cost (the broker covers the load after award),
 * so they opt in with `selectable: true` even though they are not carrier bids.
 */
export function isPriceableOption(option: CarrierQuoteOption | null | undefined): boolean {
  if (!option || !option.available) return false;
  if (!(Number.isFinite(Number(option.cost)) && Number(option.cost) > 0)) return false;
  if (option.selectable === true) return true;
  return option.selectable !== false && option.benchmark !== true;
}

export interface CarrierRecommendation {
  carrierKey: CarrierQuoteKey;
  carrierSource: string;
  carrierCost: number;
  defaultMarginPct: number;
  suggestedClientPrice: number;
  reason: string;
}

export function buildCarrierRecommendation(
  options: CarrierQuoteOption[],
  defaultMarginPct: number
): CarrierRecommendation | null {
  const available = options
    .filter(isPriceableOption)
    .sort(function(a, b) { return Number(a.cost) - Number(b.cost); });
  if (!available.length) return null;
  // Truckload leads with the DAT market estimate. For expedite, a live
  // ExpediteAll price beats the rate table (it is a real bookable number);
  // otherwise the lowest carrier bid (LTL).
  const recommended = available.find(function(option) { return option.key === 'datSpot'; }) ||
    available.find(function(option) { return option.key === 'expediteAll'; }) ||
    available.find(function(option) { return option.key === 'rateTable'; }) ||
    available[0];
  const carrierCost = Number(recommended.cost);
  return {
    carrierKey: recommended.key,
    carrierSource: recommended.source,
    carrierCost,
    defaultMarginPct,
    suggestedClientPrice: Number(
      (carrierCost * (1 + defaultMarginPct / 100)).toFixed(2)
    ),
    reason: recommendationReason(recommended, available.length)
  };
}

function recommendationReason(option: CarrierQuoteOption, count: number): string {
  if (option.key === 'datSpot') {
    return 'Priced from the DAT spot market average. Cover the truck after the customer awards the load, targeting at or below this cost.';
  }
  if (option.key === 'expediteAll') {
    return 'Priced from the live ExpediteAll rate. Compare it with the First Class rate table to keep the table accurate.';
  }
  if (option.key === 'rateTable') {
    return 'Priced from the First Class expedite rate table. Cover the van or truck after award, targeting at or below this cost.';
  }
  return count > 1
    ? 'Lowest available carrier cost. Compare it with the market rate, then confirm service and transit before sending.'
    : 'Only available carrier rate. Compare it with the market rate, then confirm service and transit before sending.';
}

export function mergeDatCarrierOptions(
  options: CarrierQuoteOption[],
  datOptions: CarrierQuoteOption[]
): CarrierQuoteOption[] {
  const replacementKeys = new Set<CarrierQuoteKey>();
  if (datOptions.some(function(option) { return option.key === 'datLoadOffers'; })) {
    replacementKeys.add('datLoadOffers');
  }
  if (datOptions.some(function(option) {
    return option.key === 'datRateView' || option.key === 'datSpot' || option.key === 'datContract';
  })) {
    replacementKeys.add('datRateView');
    replacementKeys.add('datSpot');
    replacementKeys.add('datContract');
  }
  return options
    .filter(function(option) { return !replacementKeys.has(option.key); })
    .concat(datOptions);
}
