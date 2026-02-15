import { callExpediteAllAPI, ExpediteAllResponse } from './expediteAll';
import { callForwardAirAPI, ForwardAirResponse } from './forwardAir';
import { callDATForecastAPI, DATForecastResponse } from './datForecast';
import { UnifiedQuoteRequest, ErrorResponse, StandardizedQuote } from '../types/quote';
import db from '../db';

const DEFAULT_PROFIT_MARGIN_RULE_ID = 1;

/**
 * Helper function to coerce a value to a number
 */
function coerceNumber(value: any): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.\-]/g, ''));
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * Helper function to find a number in an object by key candidates
 */
function findNumberByKeys(obj: any, keyCandidates: string[]): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keyCandidates) {
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k.toLowerCase().indexOf(key.toLowerCase()) > -1) {
        const num = coerceNumber(obj[k]);
        if (typeof num === 'number') return num;
      }
    }
  }
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v && typeof v === 'object') {
      const found = findNumberByKeys(v, keyCandidates);
      if (typeof found === 'number') return found;
    }
  }
  return undefined;
}

async function getDefaultProfitMarginPct(): Promise<number> {
  try {
    const result = await db.query(
      `SELECT margin_pct
       FROM public.profit_margin_rules
       WHERE id = $1`,
      [DEFAULT_PROFIT_MARGIN_RULE_ID]
    );
    const value = result.rows && result.rows[0] ? Number(result.rows[0].margin_pct) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch (_err) {
    return 0;
  }
}

function applyProfitMargin(total: number | undefined, marginPct: number): number | undefined {
  if (typeof total !== 'number' || Number.isNaN(total)) return total;
  const multiplier = 1 + marginPct / 100;
  return Number.isFinite(multiplier) ? total * multiplier : total;
}

/**
 * Normalize ExpediteAll response to standardized format
 */
function normalizeExpediteAll(data: ExpediteAllResponse): StandardizedQuote {
  if ('error' in data) {
    console.error('[ExpediteAll] Error in response:', data.error);
    return { source: 'ExpediteAll', error: data.error };
  }

  return {
    source: 'ExpediteAll',
    lineHaul: data.rate?.priceLineHaul,
    ratePerMile: data.rate?.rpm,
    total: data.priceTotal,
    additionalInfo: {
      truckType: data.truckType,
      transitTime: data.transitTime,
      rateCalculationID: data.rateCalculationID,
      accessorials: data.priceAccessorials?.map(acc => ({
        description: acc.description,
        code: acc.code,
        price: acc.price
      }))
    }
  };
}

/**
 * Normalize ForwardAir response to standardized format
 */
function normalizeForwardAir(data: ForwardAirResponse): StandardizedQuote {
  if ('error' in data) {
    console.error('[ForwardAir] Error in response:', data.error);
    return { source: 'ForwardAir', error: data.error };
  }

  const quoteResponse = data.QuoteResponse || {};
  const lineHaul = findNumberByKeys(quoteResponse, ['linehaul', 'line_haul', 'base', 'basecharge']);
  const total = findNumberByKeys(quoteResponse, ['quoteamount', 'totalcharges', 'total', 'grandtotal', 'amountdue']);

  // Extract accessorials
  const accessorials: Array<{ description?: string; code?: string; price?: number }> = [];
  const accessorialCharges = quoteResponse.AccessorialCharges?.AccessorialCharge;
  if (accessorialCharges) {
    const chargesArray = Array.isArray(accessorialCharges) ? accessorialCharges : [accessorialCharges];
    chargesArray.forEach((charge: any) => {
      const price = coerceNumber(charge.Amount);
      accessorials.push({
        description: charge.Description,
        code: charge.Code,
        price
      });
    });
  }

  return {
    source: 'ForwardAir',
    lineHaul,
    total,
    additionalInfo: {
      accessorials: accessorials.length > 0 ? accessorials : undefined
    }
  };
}

/**
 * Normalize DAT Forecast response to standardized format
 */
function normalizeDATForecast(data: DATForecastResponse): StandardizedQuote {
  if ('error' in data) {
    console.error('[DAT] Error in response:', data.error);
    return { source: 'DAT', error: data.error };
  }

  const forecasts = data.forecasts;
  const perTripForecast = forecasts?.perTrip?.[0];
  const perMileForecast = forecasts?.perMile?.[0];

  return {
    source: 'DAT',
    lineHaul: perTripForecast?.forecastUSD,
    ratePerMile: perMileForecast?.forecastUSD,
    total: perTripForecast?.forecastUSD,
    additionalInfo: {
      mileage: data.mileage,
      equipmentCategory: data.equipmentCategory,
      forecastDate: perTripForecast?.forecastDate,
      mae: perTripForecast?.mae
    }
  };
}

/**
 * Combined response structure from all quote APIs (standardized format)
 */
export interface UnifiedQuoteResponse {
  expediteAll: StandardizedQuote;
  forwardAir: StandardizedQuote;
  datForecast: StandardizedQuote;
}

/**
 * Calls all three quote APIs in parallel and combines the results
 * @param body - The request body containing pickup, delivery, and shipment details
 * @returns Promise resolving to a unified response with all three API results
 */
export async function getUnifiedQuotes(body: UnifiedQuoteRequest): Promise<UnifiedQuoteResponse> {
  const marginPct = await getDefaultProfitMarginPct();
  // Call all three APIs in parallel
  const [expediteAllResult, forwardAirResult, datForecastResult] = await Promise.allSettled([
    callExpediteAllAPI(body),
    callForwardAirAPI(body),
    callDATForecastAPI(body)
  ]);

  // Extract and normalize results, handling both success and failure cases
  const expediteAll: StandardizedQuote = expediteAllResult.status === 'fulfilled' 
    ? normalizeExpediteAll(expediteAllResult.value.data as ExpediteAllResponse)
    : (() => {
        const error = expediteAllResult.reason?.message || 'Failed to fetch ExpediteAll quote';
        console.error('[ExpediteAll] Error:', error, expediteAllResult.reason);
        return { source: 'ExpediteAll', error };
      })();
  
  const forwardAir: StandardizedQuote = forwardAirResult.status === 'fulfilled' 
    ? normalizeForwardAir(forwardAirResult.value.data as ForwardAirResponse)
    : (() => {
        const error = forwardAirResult.reason?.message || 'Failed to fetch Forward Air quote';
        console.error('[ForwardAir] Error:', error, forwardAirResult.reason);
        return { source: 'ForwardAir', error };
      })();

  const datForecast: StandardizedQuote = datForecastResult.status === 'fulfilled' 
    ? normalizeDATForecast(datForecastResult.value.data as DATForecastResponse)
    : (() => {
        const error = datForecastResult.reason?.message || 'Failed to fetch DAT forecast';
        console.error('[DAT] Error:', error, datForecastResult.reason);
        return { source: 'DAT', error };
      })();

  const withMargin = (quote: StandardizedQuote): StandardizedQuote => {
    if (quote.error) return quote;
    const baseTotal = typeof quote.total === 'number' ? quote.total : quote.lineHaul;
    const totalWithMargin = applyProfitMargin(baseTotal, marginPct);
    return {
      ...quote,
      total: totalWithMargin,
      additionalInfo: {
        ...quote.additionalInfo,
        profitMarginPct: marginPct
      }
    };
  };

  // Return combined response with standardized format
  return {
    expediteAll: withMargin(expediteAll),
    forwardAir: withMargin(forwardAir),
    datForecast: withMargin(datForecast)
  };
}

