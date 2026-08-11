export type CarrierQuoteKey =
  | 'expediteAll'
  | 'forwardAir'
  | 'datRateView'
  | 'datSpot'
  | 'datContract';

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
  lowRatePerMile?: number;
  highRatePerMile?: number;
  miles?: number;
  timeframe?: string;
  lookupTimestamp?: string;
  acceptedMarketLane?: string;
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
    .filter(function(option) {
      return option.available &&
        option.selectable !== false &&
        option.benchmark !== true &&
        Number.isFinite(Number(option.cost)) &&
        Number(option.cost) > 0;
    })
    .sort(function(a, b) { return Number(a.cost) - Number(b.cost); });
  if (!available.length) return null;
  const recommended = available[0];
  const carrierCost = Number(recommended.cost);
  return {
    carrierKey: recommended.key,
    carrierSource: recommended.source,
    carrierCost,
    defaultMarginPct,
    suggestedClientPrice: Number(
      (carrierCost * (1 + defaultMarginPct / 100)).toFixed(2)
    ),
    reason: available.length > 1
      ? 'Lowest available carrier cost. Compare it with the DAT market benchmark, then confirm service and transit before sending.'
      : 'Only available carrier rate. Compare it with the DAT market benchmark, then confirm service and transit before sending.'
  };
}

export function mergeDatCarrierOptions(
  options: CarrierQuoteOption[],
  datOptions: CarrierQuoteOption[]
): CarrierQuoteOption[] {
  return options
    .filter(function(option) { return !String(option.key).startsWith('dat'); })
    .concat(datOptions);
}
