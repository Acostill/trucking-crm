import https from 'https';
import { UnifiedQuoteRequest, APIResponse, ErrorResponse } from '../types/quote';

const DEFAULT_SHIPMENT_ID = '1';
const DEFAULT_REFERENCE_NUMBER = 'Reference12345';
const RATE_PATH = 'calculate-rate';

interface ExpediteAllConfig {
  endpoint?: URL;
  apiKey?: string;
  error?: string;
}

function getExpediteAllConfig(): ExpediteAllConfig {
  const baseUrl = (process.env.EXPEDITEALL_BASE_URL || '').trim();
  const apiKey = (process.env.EXPEDITEALL_API_KEY || '').trim();

  if (!baseUrl || !apiKey) {
    return {
      error: 'ExpediteAll is not configured. Set EXPEDITEALL_BASE_URL and EXPEDITEALL_API_KEY on the server.'
    };
  }

  try {
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const endpoint = new URL(RATE_PATH, normalizedBaseUrl);
    if (endpoint.protocol !== 'https:') {
      return { error: 'EXPEDITEALL_BASE_URL must use HTTPS.' };
    }
    return { endpoint, apiKey };
  } catch (_error) {
    return { error: 'EXPEDITEALL_BASE_URL is not a valid URL.' };
  }
}

export function prepareExpediteAllRequest(body: UnifiedQuoteRequest): UnifiedQuoteRequest {
  const cloned: UnifiedQuoteRequest = { ...body };
  // Internal decision metadata stays in the CRM. The validated truckType and
  // datEquipmentType remain in the carrier payload, while strict third-party
  // schemas do not receive the full GPT narrative or assignment audit object.
  delete cloned.aiRecommendation;
  delete cloned.truckAssignment;

  const pickupDate = body.pickup && body.pickup.date;
  if (typeof pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    cloned.pickup = {
      ...body.pickup,
      date: `${pickupDate}T00:00:00.000Z`
    };
  }

  const existingHaz =
    Array.isArray(body.hazardousMaterial && body.hazardousMaterial.unNumbers)
      ? (body.hazardousMaterial!.unNumbers || []).filter(function(s) {
          return typeof s === 'string' && s.trim().length > 0;
        })
      : [];
  if (existingHaz.length) {
    cloned.hazardousMaterial = {
      ...(body.hazardousMaterial || {}),
      unNumbers: existingHaz
    };
  } else {
    delete cloned.hazardousMaterial;
  }

  const existingAccessorials = Array.isArray(body.accessorialCodes)
    ? (body.accessorialCodes || []).filter(function(s) {
        return typeof s === 'string' && s.trim().length > 0;
      })
    : [];
  if (existingAccessorials.length) {
    cloned.accessorialCodes = existingAccessorials;
  } else {
    delete cloned.accessorialCodes;
  }

  if (!cloned.shipmentId) {
    cloned.shipmentId = DEFAULT_SHIPMENT_ID;
  }

  if (!cloned.referenceNumber) {
    cloned.referenceNumber = DEFAULT_REFERENCE_NUMBER;
  }

  return cloned;
}

/**
 * ExpediteAll API response structure
 */
export interface ExpediteAllResponse {
  rate?: {
    priceLineHaul?: number;
    rpm?: number;
  };
  priceTotal?: number;
  priceAccessorials?: Array<{
    description?: string;
    code?: string;
    price?: number;
  }>;
  truckType?: string;
  transitTime?: number;
  rateCalculationID?: string;
  [key: string]: any; // Allow additional properties from API
}

export function expediteAllEligibilityError(body: UnifiedQuoteRequest): string | null {
  const truckType = String(body && body.truckType || '').trim();
  if (!truckType) return null;

  const baseTruckType = truckType.replace(/^Reefer\s+/i, '');
  if (baseTruckType !== 'Cargo Van') {
    return `ExpediteAll rates Cargo Van shipments only; this load requires ${truckType}.`;
  }

  const weight = Number(body && body.weight && body.weight.value);
  if (Number.isFinite(weight) && weight > 3000) {
    return `${truckType} exceeds ExpediteAll's 3,000 lb Cargo Van limit; larger equipment is required.`;
  }

  return null;
}

export function describeExpediteAllError(
  body: UnifiedQuoteRequest,
  response: any
): string {
  const providerMessage = String(response && (response.message || response.error) || '').trim();
  const providerCode = String(response && response.code || '').trim().toUpperCase();
  const truckType = String(body && body.truckType || '').trim();
  const weight = Number(body && body.weight && body.weight.value);
  const baseTruckType = truckType.replace(/^Reefer\s+/i, '');
  const providerLimits: Record<string, { weightMax: number; nextEquipment: string }> = {
    'Cargo Van': { weightMax: 3000, nextEquipment: 'Straight Truck or larger equipment is required.' },
    'Box Truck': { weightMax: 3000, nextEquipment: 'Straight Truck or larger equipment is required.' },
    'Straight Truck': { weightMax: 8000, nextEquipment: 'Dry Van or larger equipment is required.' }
  };
  const providerLimit = providerLimits[baseTruckType];

  if (
    providerCode === 'LOAD_WEIGHT_OVER_LIMIT' &&
    providerLimit &&
    Number.isFinite(weight) &&
    weight > providerLimit.weightMax
  ) {
    return `${truckType} exceeds ExpediteAll's ${providerLimit.weightMax.toLocaleString('en-US')} lb limit; ${providerLimit.nextEquipment}`;
  }

  return providerMessage || 'ExpediteAll rejected the rating request.';
}

/**
 * Calls the external ExpediteAll API
 * @param body - The request body to send to the API
 * @returns Promise resolving to an object with statusCode and data
 */
export function callExpediteAllAPI(body: UnifiedQuoteRequest): Promise<APIResponse<ExpediteAllResponse | ErrorResponse>> {
  return new Promise((resolve, reject) => {
    const config = getExpediteAllConfig();
    if (!config.endpoint || !config.apiKey) {
      resolve({
        statusCode: 503,
        data: { error: config.error || 'ExpediteAll is not configured.' } as ErrorResponse
      });
      return;
    }

    const eligibilityError = expediteAllEligibilityError(body || {} as UnifiedQuoteRequest);
    if (eligibilityError) {
      resolve({
        statusCode: 422,
        data: { error: eligibilityError } as ErrorResponse
      });
      return;
    }

    const payload = JSON.stringify(prepareExpediteAllRequest(body || {} as UnifiedQuoteRequest) || {});
    const options = {
      method: 'POST',
      hostname: config.endpoint.hostname,
      port: config.endpoint.port || undefined,
      path: `${config.endpoint.pathname}${config.endpoint.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-API-Key': config.apiKey
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        const contentType = String((apiRes.headers && apiRes.headers['content-type']) || '');
        const looksLikeJson = /^[\s\r\n]*[\[{]/.test(data);
        if (contentType.indexOf('application/json') > -1 || looksLikeJson) {
          try {
            const parsed = JSON.parse(data) as ExpediteAllResponse;
            // Log raw ExpediteAll response for debugging (full JSON, no [Object])
            console.log('[ExpediteAll] Raw response:', JSON.stringify({ statusCode: apiRes.statusCode, data: parsed }, null, 2));
            const statusCode = apiRes.statusCode || 500;
            if (statusCode < 200 || statusCode >= 300) {
              resolve({
                statusCode,
                data: {
                  error: describeExpediteAllError(body, parsed) || `ExpediteAll returned HTTP ${statusCode}`,
                  raw: data
                } as ErrorResponse
              });
              return;
            }
            resolve({ statusCode, data: parsed });
          } catch (e) {
            resolve({ statusCode: apiRes.statusCode || 500, data: { error: 'Failed to parse JSON response', raw: data } as ErrorResponse });
          }
        } else {
          const statusCode = apiRes.statusCode || 500;
          const route = config.endpoint ? config.endpoint.pathname : RATE_PATH;
          resolve({
            statusCode,
            data: {
              error: `ExpediteAll gateway returned an unexpected response (HTTP ${statusCode}) for ${route}. Verify the production base URL and API key.`,
              raw: data.slice(0, 1000)
            } as ErrorResponse
          });
        }
      });
    });

    apiReq.on('error', function(err) {
      reject(err);
    });

    apiReq.write(payload);
    apiReq.end();
  });
}
