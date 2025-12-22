import https from 'https';
import xml2js from 'xml2js';

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
export function callForwardAirAPI(body: any): Promise<{ statusCode: number; data: any }> {
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
        <OriginZipCode>${pickupLoc.zip || '90746'}</OriginZipCode>
        <OriginCountryCode>US</OriginCountryCode>
        <Pickup>
            <AirportPickup>N</AirportPickup>
        </Pickup>
    </Origin>
    <Destination>
        <DestinationAirportCode/>
        <DestinationZipCode>${deliveryLoc.zip || '48154'}</DestinationZipCode>
        <DestinationCountryCode>US</DestinationCountryCode>
        <Delivery>
            <AirportDelivery>N</AirportDelivery>
        </Delivery>
    </Destination>
    <FreightDetails>
        <FreightDetail>
            <Weight>${Number(weight.value || 1500)}</Weight>
            <WeightType>${toWeightType(weight.unit)}</WeightType>
            <Pieces>${Number(pieces.quantity || 1)}</Pieces>
            <FreightClass>60.0</FreightClass>
        </FreightDetail>
    </FreightDetails>
    <Dimensions>
        <Dimension>
            <Pieces>${Number(pieces.quantity || 1)}</Pieces>
            <Length>${Number(firstPart.length || 40)}</Length>
            <Width>${Number(firstPart.width || 30)}</Width>
            <Height>${Number(firstPart.height || 20)}</Height>
        </Dimension>
    </Dimensions>
    <Hazmat>N</Hazmat>
    <InBondShipment>N</InBondShipment>
    <DeclaredValue>0.00</DeclaredValue>
    <ShippingDate>${toYMD(pickup.date)}</ShippingDate>
</QuoteRequest>`;

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
                resolve({ statusCode: apiRes.statusCode || 500, data: result });
              }
            }
          );
        } else if (lowerContentType.indexOf('json') > -1) {
          try {
            resolve({ statusCode: apiRes.statusCode || 500, data: JSON.parse(data) });
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

