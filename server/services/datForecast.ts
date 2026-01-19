import https from 'https';
import { UnifiedQuoteRequest, APIResponse } from '../types/quote';

/**
 * DAT Forecast API request structure (internal format sent to DAT API)
 */
export interface DATForecastRequest {
  origin: {
    city: string;
    postalCode: string;
    stateProv: string;
  };
  destination: {
    city: string;
    postalCode: string;
    stateProv: string;
  };
  equipmentCategory: 'VAN' | 'FLATBED' | 'REEFER' | 'STEPDECK';
  forecastPeriod: '52WEEKS';
}

/**
 * DAT Forecast API forecast entry structure
 */
export interface DATForecastEntry {
  forecastDate: string;
  forecastUSD: number;
  mae: {
    highUSD: number;
    lowUSD: number;
  };
}

/**
 * DAT Forecast API response structure
 */
export interface DATForecastResponse {
  origin?: string;
  destination?: string;
  processTime?: string;
  equipmentCategory?: string;
  forecasts: {
    perMile: DATForecastEntry[];
    perTrip: DATForecastEntry[];
  };
  mileage?: number;
  searchCriteria?: {
    origin?: {
      city?: string;
      postalCode?: string;
      stateProv?: string;
      bestMatch?: string;
    };
    destination?: {
      city?: string;
      postalCode?: string;
      stateProv?: string;
      bestMatch?: string;
    };
    equipmentCategory?: string;
    forecastPeriod?: string;
  };
  error?: string;
  raw?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * DAT Access Token response structure
 */
interface DATAccessTokenResponse {
  accessToken: string;
  expiresWhen?: string;
}

/**
 * Gets an access token from DAT identity API
 * @returns Promise resolving to the access token string
 */
function getDATAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const username = process.env.DAT_USERNAME;
    const password = process.env.DAT_PASSWORD;

    if (!username || !password) {
      reject(new Error('DAT_USERNAME and DAT_PASSWORD environment variables are required'));
      return;
    }

    const payload = JSON.stringify({
      username: username,
      password: password
    });

    const options = {
      method: 'POST',
      hostname: 'identity.api.staging.dat.com',
      path: '/access/v1/token/organization',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        if (apiRes.statusCode && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            if (result.accessToken) {
              resolve(result.accessToken);
            } else {
              reject(new Error('No accessToken in DAT authentication response'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse DAT authentication response: ${e.message}`));
          }
        } else {
          reject(new Error(`DAT authentication failed with status ${apiRes.statusCode}: ${data}`));
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

/**
 * Maps truck type or equipment from request to DAT equipment category
 * @param truckType - The truck type string (optional)
 * @returns DAT equipment category string (defaults to "VAN")
 */
function mapEquipmentCategory(truckType?: string): string {
  if (!truckType) return 'VAN';
  
  const normalized = String(truckType).toUpperCase();
  
  // Map common truck types to DAT categories
  if (normalized.includes('VAN') || normalized.includes('DRY')) return 'VAN';
  if (normalized.includes('FLAT') || normalized.includes('FLATBED')) return 'FLATBED';
  if (normalized.includes('REEFER') || normalized.includes('REFRIGERATED')) return 'REEFER';
  if (normalized.includes('STEP') || normalized.includes('STEPDECK')) return 'STEPDECK';
  
  // Default to VAN
  return 'VAN';
}

/**
 * Calls the DAT forecast API
 * @param body - The request body containing pickup, delivery, and optional truck type
 * @returns Promise resolving to an object with statusCode and data
 */
export function callDATForecastAPI(body: UnifiedQuoteRequest): Promise<APIResponse<DATForecastResponse | ErrorResponse>> {
  return new Promise(async (resolve, reject) => {
    try {
      // First, get the access token
      const accessToken = await getDATAccessToken();

      // Extract pickup and delivery locations
      const pickup = body.pickup || {};
      const pickupLoc = pickup.location || {};
      const delivery = body.delivery || {};
      const deliveryLoc = delivery.location || {};

      // Map equipment category (default to VAN)
      const equipmentCategory = mapEquipmentCategory(body.truckType || body.equipmentCategory);

      // Build the DAT API request body
      const datPayload = {
        origin: {
          city: pickupLoc.city || '',
          postalCode: pickupLoc.zip || '',
          stateProv: pickupLoc.state || ''
        },
        destination: {
          city: deliveryLoc.city || '',
          postalCode: deliveryLoc.zip || '',
          stateProv: deliveryLoc.state || ''
        },
        equipmentCategory: equipmentCategory,
        forecastPeriod: '52WEEKS'
      };

      const payload = JSON.stringify(datPayload);

      const options = {
        method: 'POST',
        hostname: 'analytics.api.staging.dat.com',
        path: '/linehaulrates/v1/forecasts/spot',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, function(apiRes) {
        let data = '';
        apiRes.on('data', function(chunk) { data += chunk; });
        apiRes.on('end', function() {
          const contentType = (apiRes.headers && apiRes.headers['content-type']) || 'application/json';
          if (contentType.indexOf('application/json') > -1) {
            try {
              const parsedData = JSON.parse(data);
              
              // Enrich response with dummy forecasts if missing
              if (!parsedData.forecasts) {
                // Format date to match expected format: "2020-01-12T00:00:00+0000"
                const now = new Date();
                const year = now.getUTCFullYear();
                const month = String(now.getUTCMonth() + 1).padStart(2, '0');
                const day = String(now.getUTCDate()).padStart(2, '0');
                const forecastDate = `${year}-${month}-${day}T00:00:00+0000`;
                
                parsedData.forecasts = {
                  perMile: [
                    {
                      forecastDate: forecastDate,
                      forecastUSD: 0,
                      mae: {
                        highUSD: 0,
                        lowUSD: 0
                      }
                    }
                  ],
                  perTrip: [
                    {
                      forecastDate: forecastDate,
                      forecastUSD: 0,
                      mae: {
                        highUSD: 0,
                        lowUSD: 0
                      }
                    }
                  ]
                };
              }
              
              resolve({ statusCode: apiRes.statusCode || 500, data: parsedData });
            } catch (e) {
              resolve({ statusCode: apiRes.statusCode || 500, data: { error: 'Failed to parse JSON response', raw: data } });
            }
          } else {
            resolve({ statusCode: apiRes.statusCode || 500, data: { raw: data } });
          }
        });
      });

      apiReq.on('error', function(err) {
        reject(err);
      });

      apiReq.write(payload);
      apiReq.end();
    } catch (err) {
      reject(err);
    }
  });
}


