import https from 'https';
import { UnifiedQuoteRequest, APIResponse, ErrorResponse } from '../types/quote';

const DEFAULT_SHIPMENT_ID = '1';
const DEFAULT_REFERENCE_NUMBER = 'Reference12345';

function applyExpediteAllDefaults(body: UnifiedQuoteRequest): UnifiedQuoteRequest {
  const cloned: UnifiedQuoteRequest = { ...body };

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

/**
 * Calls the external ExpediteAll API
 * @param body - The request body to send to the API
 * @returns Promise resolving to an object with statusCode and data
 */
export function callExpediteAllAPI(body: UnifiedQuoteRequest): Promise<APIResponse<ExpediteAllResponse | ErrorResponse>> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(applyExpediteAllDefaults(body || {} as UnifiedQuoteRequest) || {});
    const options = {
      method: 'POST',
      hostname: 'stage-lb-public-api-back.rhinocodes.org',
      path: '/api/v2/calculate-rate',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-API-Key': 'S7RcSvj5jAhl.2c7e2ZXsOQQqsW0zQedWlRfrDcJ1BPWa'
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        const contentType = (apiRes.headers && apiRes.headers['content-type']) || 'application/json';
        if (contentType.indexOf('application/json') > -1) {
          try {
            const parsed = JSON.parse(data) as ExpediteAllResponse;
            // Log raw ExpediteAll response for debugging (full JSON, no [Object])
            console.log('[ExpediteAll] Raw response:', JSON.stringify({ statusCode: apiRes.statusCode, data: parsed }, null, 2));
            const statusCode = apiRes.statusCode || 500;
            if (statusCode < 200 || statusCode >= 300) {
              const providerMessage = (parsed as any).message || (parsed as any).error;
              resolve({
                statusCode,
                data: {
                  error: providerMessage || `ExpediteAll returned HTTP ${statusCode}`,
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
          resolve({ statusCode: apiRes.statusCode || 500, data: { error: 'Non-JSON response received', raw: data } as ErrorResponse });
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
