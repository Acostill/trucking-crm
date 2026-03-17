import https from 'https';
import xml2js from 'xml2js';
import { UnifiedQuoteRequest, APIResponse, ErrorResponse } from '../types/quote';

/**
 * Forward Air API response structure (parsed from XML)
 */
export interface ForwardAirResponse {
  QuoteResponse?: {
    QuoteAmount?: string | number;
    LineHaul?: string | number;
    TotalCharges?: string | number;
    AccessorialCharges?: {
      AccessorialCharge?: Array<{
        Code?: string;
        Description?: string;
        Amount?: string | number;
      }> | {
        Code?: string;
        Description?: string;
        Amount?: string | number;
      };
    };
    [key: string]: any;
  };
  error?: string;
  raw?: string;
  [key: string]: any; // Allow additional properties from parsed XML
}

/**
 * Helper function to convert weight unit to Forward Air format
 */
function toWeightType(unit: string): string {
  const u = String(unit || '').toLowerCase();
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'L';
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'K';
  return 'L';
}

/**
 * Helper function to convert date to YYYY-MM-DD format
 */
function toYMD(dateInput: string): string {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  } catch (_e) {
    return '2020-11-02';
  }
}

/**
 * Calls the Forward Air quotes API
 * @param body - The request body containing pickup, delivery, pieces, and weight information
 * @returns Promise resolving to an object with statusCode and data
 */
export function callForwardAirAPI(body: UnifiedQuoteRequest): Promise<APIResponse<ForwardAirResponse | ErrorResponse>> {
  return new Promise((resolve, reject) => {
    const pickup = body.pickup || {};
    const pickupLoc = pickup.location || {};
    const delivery = body.delivery || {};
    const deliveryLoc = delivery.location || {};
    const pieces = body.pieces || {};
    const parts = Array.isArray(pieces.parts) ? pieces.parts : [];
    const firstPart = parts[0] || {};
    const weight = body.weight || {};

    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<QuoteRequest>
    <BillToCustomerNumber>2300130</BillToCustomerNumber>
    <ShipperCustomerNumber>1234567</ShipperCustomerNumber>
    <Origin>
        <OriginAirportCode/>
        <OriginZipCode>${pickupLoc.zip}</OriginZipCode>
        <OriginCountryCode>US</OriginCountryCode>
        <Pickup>
            <AirportPickup>N</AirportPickup>
        </Pickup>
    </Origin>
    <Destination>
        <DestinationAirportCode/>
        <DestinationZipCode>${deliveryLoc.zip}</DestinationZipCode>
        <DestinationCountryCode>US</DestinationCountryCode>
        <Delivery>
            <AirportDelivery>N</AirportDelivery>
        </Delivery>
    </Destination>
    <FreightDetails>
        <FreightDetail>
            <Weight>${Number(weight.value)}</Weight>
            <WeightType>${toWeightType(weight.unit)}</WeightType>
            <Pieces>${Number(pieces.quantity)}</Pieces>
            <FreightClass>60.0</FreightClass>
        </FreightDetail>
    </FreightDetails>
    <Dimensions>
        <Dimension>
            <Pieces>${Number(pieces.quantity)}</Pieces>
            <Length>${Number(firstPart.length)}</Length>
            <Width>${Number(firstPart.width)}</Width>
            <Height>${Number(firstPart.height)}</Height>
        </Dimension>
    </Dimensions>
    <Hazmat>N</Hazmat>
    <InBondShipment>N</InBondShipment>
    <DeclaredValue>0.00</DeclaredValue>
    <ShippingDate>${toYMD(pickup.date)}</ShippingDate>
</QuoteRequest>`;

//https://api.forwardair.com
//test-api.forwardair.com
    const options = {
      method: 'POST',
      hostname: 'test-api.forwardair.com',
      path: '/ltlservices/v2/rest/waybills/quotes',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
        'Content-Length': Buffer.byteLength(xmlBody),
        'user': 'firstmia',
        'password': 'L3R2KKgoUjBf4Df6',
        'customerId': 'FIRSTMIA'
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        const contentType = (apiRes.headers && apiRes.headers['content-type']) || 'application/xml';
        const lowerContentType = String(contentType || '').toLowerCase();
        if (lowerContentType.indexOf('xml') > -1) {
          xml2js.parseString(
            data,
            { explicitArray: false, trim: true, explicitRoot: false },
            function(err, result) {
              if (err) {
                resolve({ statusCode: apiRes.statusCode || 500, data: { error: 'Failed to parse XML response', raw: data } });
              } else {
                // Log raw Forward Air parsed XML response for debugging (full JSON, no [Object])
                console.log('[ForwardAir] Raw response:', JSON.stringify({ statusCode: apiRes.statusCode, data: result }, null, 2));
                resolve({ statusCode: apiRes.statusCode || 500, data: result });
              }
            }
          );
        } else if (lowerContentType.indexOf('json') > -1) {
          try {
            const parsed = JSON.parse(data);
            console.log('[ForwardAir] Raw JSON response:', JSON.stringify({ statusCode: apiRes.statusCode, data: parsed }, null, 2));
            resolve({ statusCode: apiRes.statusCode || 500, data: parsed });
          } catch (e) {
            resolve({ statusCode: apiRes.statusCode || 500, data: { error: 'Invalid JSON from upstream', raw: data } });
          }
        } else {
          resolve({ statusCode: apiRes.statusCode || 500, data: { raw: data } });
        }
      });
    });

    apiReq.on('error', function(err) {
      reject(err);
    });

    apiReq.write(xmlBody);
    apiReq.end();
  });
}

