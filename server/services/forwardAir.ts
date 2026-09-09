import https from 'https';
import xml2js from 'xml2js';
import { UnifiedQuoteRequest, APIResponse, ErrorResponse } from '../types/quote';

export interface ForwardAirResponse {
  QuoteResponse?: {
    QuoteAmount?: string | number;
    LineHaul?: string | number;
    TotalCharges?: string | number;
    AccessorialCharges?: {
      AccessorialCharge?: Array<{ Code?: string; Description?: string; Amount?: string | number }> |
        { Code?: string; Description?: string; Amount?: string | number };
    };
    [key: string]: any;
  };
  error?: string;
  raw?: string;
  [key: string]: any;
}

interface ForwardAirConfig {
  endpoint?: URL;
  username?: string;
  password?: string;
  customerId?: string;
  billToCustomerNumber?: string;
  shipperCustomerNumber?: string;
  error?: string;
}

const PRODUCTION_HOST = 'api.forwardair.com';
const QUOTE_PATH = '/ltlservices/v2/rest/waybills/quotes';

function configuredText(name: string): string {
  return String(process.env[name] || '').trim();
}

export function getForwardAirConfig(): ForwardAirConfig {
  const baseUrl = configuredText('FORWARD_AIR_BASE_URL');
  const username = configuredText('FORWARD_AIR_USERNAME');
  const password = configuredText('FORWARD_AIR_PASSWORD');
  const customerId = configuredText('FORWARD_AIR_CUSTOMER_ID');
  const billToCustomerNumber = configuredText('FORWARD_AIR_BILL_TO_CUSTOMER_NUMBER');
  const shipperCustomerNumber = configuredText('FORWARD_AIR_SHIPPER_CUSTOMER_NUMBER');
  if (!baseUrl || !username || !password || !customerId || !billToCustomerNumber || !shipperCustomerNumber) {
    return { error: 'Forward Air production rating is not configured. Set FORWARD_AIR_BASE_URL, FORWARD_AIR_USERNAME, FORWARD_AIR_PASSWORD, FORWARD_AIR_CUSTOMER_ID, FORWARD_AIR_BILL_TO_CUSTOMER_NUMBER, and FORWARD_AIR_SHIPPER_CUSTOMER_NUMBER.' };
  }
  try {
    const endpoint = new URL(QUOTE_PATH, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== PRODUCTION_HOST) {
      return { error: 'FORWARD_AIR_BASE_URL must point to the HTTPS production Forward Air API.' };
    }
    return { endpoint, username, password, customerId, billToCustomerNumber, shipperCustomerNumber };
  } catch (_error) {
    return { error: 'FORWARD_AIR_BASE_URL is not a valid URL.' };
  }
}

function toWeightType(unit: string): string {
  const normalized = String(unit || '').toLowerCase();
  return normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms' ? 'K' : 'L';
}

function ymd(value: any): string | undefined {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  return match ? match[1] : undefined;
}

function xml(value: any): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function positive(value: any): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function freightClass(value: any): string | undefined {
  const normalized = String(value || '').trim();
  const parsed = Number(normalized);
  return /^\d{1,3}(?:\.5)?$/.test(normalized) && parsed >= 50 && parsed <= 500 ? normalized : undefined;
}

function requestError(body: UnifiedQuoteRequest): string | undefined {
  const pickupZip = body.pickup?.location?.zip;
  const deliveryZip = body.delivery?.location?.zip;
  const part = Array.isArray(body.pieces?.parts) ? body.pieces!.parts![0] : undefined;
  if (!/^\d{5}(?:-\d{4})?$/.test(String(pickupZip || ''))) return 'Forward Air requires a valid five-digit pickup ZIP.';
  if (!/^\d{5}(?:-\d{4})?$/.test(String(deliveryZip || ''))) return 'Forward Air requires a valid five-digit delivery ZIP.';
  if (!ymd(body.pickup?.date)) return 'Forward Air requires a valid pickup date.';
  if (!positive(body.weight?.value) || !positive(body.pieces?.quantity) || !positive(part?.length) || !positive(part?.width) || !positive(part?.height)) return 'Forward Air requires positive pieces, weight, and dimensions.';
  if (!freightClass(body.forwardAirFreightClass)) return 'Forward Air requires a confirmed LTL freight class before requesting a production rate.';
  return undefined;
}

export function callForwardAirAPI(body: UnifiedQuoteRequest): Promise<APIResponse<ForwardAirResponse | ErrorResponse>> {
  const config = getForwardAirConfig();
  if (config.error) return Promise.resolve({ statusCode: 503, data: { error: config.error } });
  const invalid = requestError(body);
  if (invalid) return Promise.resolve({ statusCode: 400, data: { error: invalid } });

  const pickup = body.pickup || {};
  const delivery = body.delivery || {};
  const pieces = body.pieces || {};
  const part = (pieces.parts || [])[0] || {};
  const hazardous = Boolean(body.hazardousMaterial?.unNumbers?.filter(Boolean).length);
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<QuoteRequest>
  <BillToCustomerNumber>${xml(config.billToCustomerNumber)}</BillToCustomerNumber>
  <ShipperCustomerNumber>${xml(config.shipperCustomerNumber)}</ShipperCustomerNumber>
  <Origin><OriginAirportCode/><OriginZipCode>${xml(pickup.location?.zip)}</OriginZipCode><OriginCountryCode>US</OriginCountryCode><Pickup><AirportPickup>N</AirportPickup></Pickup></Origin>
  <Destination><DestinationAirportCode/><DestinationZipCode>${xml(delivery.location?.zip)}</DestinationZipCode><DestinationCountryCode>US</DestinationCountryCode><Delivery><AirportDelivery>N</AirportDelivery></Delivery></Destination>
  <FreightDetails><FreightDetail><Weight>${positive(body.weight?.value)}</Weight><WeightType>${toWeightType(body.weight?.unit || '')}</WeightType><Pieces>${positive(pieces.quantity)}</Pieces><FreightClass>${freightClass(body.forwardAirFreightClass)}</FreightClass></FreightDetail></FreightDetails>
  <Dimensions><Dimension><Pieces>${positive(pieces.quantity)}</Pieces><Length>${positive(part.length)}</Length><Width>${positive(part.width)}</Width><Height>${positive(part.height)}</Height></Dimension></Dimensions>
  <Hazmat>${hazardous ? 'Y' : 'N'}</Hazmat><InBondShipment>N</InBondShipment><DeclaredValue>0.00</DeclaredValue><ShippingDate>${ymd(pickup.date)}</ShippingDate>
</QuoteRequest>`;

  return new Promise((resolve, reject) => {
    const request = https.request({
      method: 'POST', hostname: config.endpoint!.hostname, path: config.endpoint!.pathname,
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml', 'Content-Length': Buffer.byteLength(xmlBody), user: config.username!, password: config.password!, customerId: config.customerId! }
    }, function(response) {
      let raw = '';
      response.on('data', function(chunk) { raw += chunk; });
      response.on('end', function() {
        if (String(response.headers?.['content-type'] || '').toLowerCase().includes('xml')) {
          // Keep the provider's response root. The normalizer expects
          // `QuoteResponse`, and flattening it can silently drop the quote.
          xml2js.parseString(raw, { explicitArray: false, trim: true, explicitRoot: true }, function(error, data) {
            resolve({ statusCode: response.statusCode || 500, data: error ? { error: 'Failed to parse Forward Air response.' } : data });
          });
        } else resolve({ statusCode: response.statusCode || 502, data: { error: 'Forward Air returned an unexpected response format.' } });
      });
    });
    request.on('error', reject);
    request.write(xmlBody);
    request.end();
  });
}
