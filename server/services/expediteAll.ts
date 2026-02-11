import https from 'https';
import { UnifiedQuoteRequest, APIResponse, ErrorResponse } from '../types/quote';

const DEFAULT_HAZARDOUS_UN_NUMBERS = ['UN3508', 'UN3530', 'UN3536', 'UN3548'];
const DEFAULT_ACCESSORIAL_CODES = ['CALLDEL', 'DEBRISREM', 'UPK'];
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
  if (!existingHaz.length) {
    cloned.hazardousMaterial = {
      ...(body.hazardousMaterial || {}),
      unNumbers: DEFAULT_HAZARDOUS_UN_NUMBERS.slice()
    };
  }

  const existingAccessorials = Array.isArray(body.accessorialCodes)
    ? (body.accessorialCodes || []).filter(function(s) {
        return typeof s === 'string' && s.trim().length > 0;
      })
    : [];
  if (!existingAccessorials.length) {
    cloned.accessorialCodes = DEFAULT_ACCESSORIAL_CODES.slice();
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
            resolve({ statusCode: apiRes.statusCode || 500, data: JSON.parse(data) as ExpediteAllResponse });
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

