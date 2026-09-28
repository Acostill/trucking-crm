export type CarrierQuoteKey =
  | 'expediteAll'
  | 'forwardAir'
  | 'datRateView'
  | 'datSpot'
  | 'datContract'
  | 'datLoadOffers'
  | 'rateTable'
  | 'laneHistory'
  | 'manualQuote';

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
  fuelAdjustment?: number;
  laneFactor?: number;
  laneSamples?: number;
  // Estimates only: cost before extras/urgency, and what was added.
  baseCost?: number;
  extrasTotal?: number;
  urgencyAmount?: number;
  extrasNote?: string;
  transitEstimate?: TransitEstimate;
  note?: string;
}

export interface TransitEstimate {
  hours: number;
  soloDays: number;
  teamDays: number;
  label: string;
}

// Solo drivers average ~50 mph including stops and can legally drive about
// 10 hours a day (~500 miles); team drivers run close to around the clock.
const SOLO_MILES_PER_DAY = 500;
const TEAM_MILES_PER_DAY = 1000;
const AVERAGE_MPH = 50;

export function transitEstimate(miles: number): TransitEstimate | null {
  if (!(miles > 0)) return null;
  const hours = Math.max(1, Math.round(miles / AVERAGE_MPH));
  const soloDays = Math.max(1, Math.ceil(miles / SOLO_MILES_PER_DAY));
  const teamDays = Math.max(1, Math.ceil(miles / TEAM_MILES_PER_DAY));
  const label = hours <= 10
    ? `Same day, about ${hours} hr of driving`
    : soloDays === teamDays
      ? `${soloDays} day${soloDays === 1 ? '' : 's'}`
      : `${soloDays} days solo, ${teamDays} day${teamDays === 1 ? '' : 's'} with a team driver`;
  return { hours, soloDays, teamDays, label };
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

export type PriceConfidence = 'high' | 'medium' | 'low';

export interface CarrierRecommendation {
  carrierKey: CarrierQuoteKey;
  carrierSource: string;
  carrierCost: number;
  defaultMarginPct: number;
  minMarginAmount?: number;
  suggestedClientPrice: number;
  // Trip miles behind the buy rate, when known, for rate-per-mile display.
  miles?: number;
  // What to pay the carrier: aim for the low end, never above the high end.
  buyRange?: { low: number; high: number; basis: 'dat' | 'carrier' | 'estimate' };
  transit?: TransitEstimate;
  reason: string;
  // One word staff act on: high = send it, medium = glance at it,
  // low = check with a carrier before sending.
  confidence: PriceConfidence;
  confidenceReason: string;
}

/**
 * How much to trust a suggested buy rate. Live carrier prices and DAT are
 * real market numbers; the rate table is only as good as the real prices
 * behind it on that lane and vehicle.
 */
export function priceConfidence(option: CarrierQuoteOption): { confidence: PriceConfidence; reason: string } {
  if (option.key === 'manualQuote') return { confidence: 'high', reason: 'Price recorded from a carrier' };
  if (option.key === 'expediteAll' || option.key === 'forwardAir') {
    return option.fromCache
      ? { confidence: 'medium', reason: `${option.source} price from a recent identical quote` }
      : { confidence: 'high', reason: `Live ${option.source} price` };
  }
  if (option.key === 'datSpot') return { confidence: 'high', reason: 'DAT spot market for this lane this week' };
  if (option.key === 'rateTable') {
    const vehicle = String(option.truckType || '').replace(/^Reefer\s+/i, '');
    if (option.urgencyAmount) {
      return { confidence: 'low', reason: 'Same-day or next-day pickup, so truck availability is not confirmed' };
    }
    if (option.laneSamples && option.laneSamples >= 2) {
      return { confidence: 'high', reason: `Based on ${option.laneSamples} real prices on this lane` };
    }
    if (vehicle === 'Cargo Van') {
      return { confidence: 'medium', reason: 'Van rate built from past ExpediteAll prices; no history on this lane yet' };
    }
    return { confidence: 'low', reason: `No real ${vehicle.toLowerCase() || 'truck'} prices on this lane yet` };
  }
  return { confidence: 'medium', reason: 'Estimated price' };
}

/**
 * Broker margin is a share of the sell rate (sell = buy / (1 - margin)),
 * not a markup on the buy rate: a 10% margin on a $900 truck is $1,000.
 * The minimum profit per load wins when it gives the higher price.
 */
export function clientPriceFor(cost: number, marginPct: number, minMarginAmount = 0): number {
  const margin = Math.min(Math.max(marginPct, 0), 90) / 100;
  const byPct = cost / (1 - margin);
  return Number(Math.max(byPct, cost + (minMarginAmount || 0)).toFixed(2));
}

export function buildCarrierRecommendation(
  options: CarrierQuoteOption[],
  defaultMarginPct: number,
  minMarginAmount = 0
): CarrierRecommendation | null {
  const available = options
    .filter(isPriceableOption)
    .sort(function(a, b) { return Number(a.cost) - Number(b.cost); });
  if (!available.length) return null;
  // Truckload leads with the DAT market estimate. For expedite, a live
  // ExpediteAll price beats the rate table (it is a real bookable number);
  // otherwise the lowest carrier bid (LTL).
  // A price staff recorded from a carrier is the most concrete number there is.
  const recommended = available.find(function(option) { return option.key === 'manualQuote'; }) ||
    available.find(function(option) { return option.key === 'datSpot'; }) ||
    available.find(function(option) { return option.key === 'expediteAll'; }) ||
    available.find(function(option) { return option.key === 'rateTable'; }) ||
    available[0];
  const carrierCost = Number(recommended.cost);
  const suggestedClientPrice = clientPriceFor(carrierCost, defaultMarginPct, minMarginAmount);
  // Never pay more than the sell rate minus the minimum profit per load.
  const range = buyRangeFor(recommended, priceConfidence(recommended).confidence);
  const maxBuy = Number((suggestedClientPrice - (minMarginAmount || 0)).toFixed(2));
  const buyRange = { ...range, high: Math.max(carrierCost, Math.min(range.high, maxBuy)) };
  return {
    carrierKey: recommended.key,
    carrierSource: recommended.source,
    carrierCost,
    defaultMarginPct,
    ...(minMarginAmount ? { minMarginAmount } : {}),
    suggestedClientPrice,
    ...(Number(recommended.miles) > 0 ? { miles: Number(recommended.miles) } : {}),
    buyRange,
    ...(recommended.transitEstimate || transitEstimate(Number(recommended.miles))
      ? { transit: recommended.transitEstimate || transitEstimate(Number(recommended.miles))! }
      : {}),
    reason: recommendationReason(recommended, available.length),
    confidence: priceConfidence(recommended).confidence,
    confidenceReason: priceConfidence(recommended).reason
  };
}

const ESTIMATE_RANGE: Record<PriceConfidence, number> = { high: 0.05, medium: 0.10, low: 0.15 };

/**
 * A cover range like other broker tools show. DAT gives its own low/high for
 * the lane; a firm carrier price is the ceiling; estimates get a band that
 * widens as confidence drops.
 */
export function buyRangeFor(
  option: CarrierQuoteOption,
  confidence: PriceConfidence
): { low: number; high: number; basis: 'dat' | 'carrier' | 'estimate' } {
  const cost = Number(option.cost);
  const round = function(value: number) { return Number(value.toFixed(2)); };
  if (option.key === 'datSpot' && Number(option.marketLow) > 0 && Number(option.marketHigh) > 0 && Number(option.marketAverage) > 0) {
    // Scale DAT's range to the all-in cost (extras and urgency included).
    const average = Number(option.marketAverage);
    return { low: round(cost * Number(option.marketLow) / average), high: round(cost * Number(option.marketHigh) / average), basis: 'dat' };
  }
  if (option.key === 'manualQuote' || option.key === 'expediteAll' || option.key === 'forwardAir') {
    return { low: round(cost * 0.95), high: round(cost), basis: 'carrier' };
  }
  const width = ESTIMATE_RANGE[confidence];
  return { low: round(cost * (1 - width)), high: round(cost * (1 + width)), basis: 'estimate' };
}

function recommendationReason(option: CarrierQuoteOption, count: number): string {
  if (option.key === 'datSpot') {
    return 'Priced from the DAT spot market average. Cover the truck after the customer awards the load, targeting at or below this cost.';
  }
  if (option.key === 'manualQuote') {
    return 'Priced from the carrier price recorded by staff. It is also saved to lane history to keep the rate table accurate.';
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
