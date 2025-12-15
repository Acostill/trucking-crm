import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import https from 'https';
import xml2js from 'xml2js';
import util from 'util';
import { URL } from 'url';
import db from '../db';

const router = express.Router();

function generateLoadNumber() {
  const random = Math.floor(Math.random() * 900) + 100; // 3-digit entropy
  return 'EMAIL-' + Date.now() + '-' + random;
}

function formatLocation(location: any) {
  if (!location || typeof location !== 'object') return null;
  const segments: string[] = [];
  if (location.city) segments.push(location.city);
  if (location.state) segments.push(location.state);
  const cityState = segments.length ? segments.join(', ') : null;
  const zip = location.zip ? String(location.zip) : null;
  if (cityState && zip) return cityState + ' ' + zip;
  return cityState || zip || null;
}

function buildLoadRecordFromOutput(output: any) {
  if (!output || typeof output !== 'object') return null;

  const shipment =
    output.shipment ||
    (output.body && output.body.shipment_details) ||
    {};

  const pickup =
    shipment.pickup ||
    (shipment.shipment && shipment.shipment.pickup) ||
    {};
  const delivery =
    shipment.delivery ||
    (shipment.shipment && shipment.shipment.delivery) ||
    {};

  const shipmentInfo = shipment.shipment_info || shipment.shipmentInfo || {};
  const billing = output.billing || {};
  const dimensions = shipment.dimensions || shipmentInfo.dimensions || {};

  const customer =
    output.client_name ||
    (output.sender && (output.sender.company || output.sender.name)) ||
    output.sender;
  if (!customer) return null;

  const rateValue =
    shipment.rate != null
      ? shipment.rate
      : billing.rate != null
        ? billing.rate
        : shipment.payment_terms && shipment.payment_terms.rate;
  let numericRate = typeof rateValue === 'number' ? rateValue : Number(rateValue);
  if (Number.isNaN(numericRate)) numericRate = null;

  const weightValue =
    shipment.shipment_weight_lbs != null
      ? shipment.shipment_weight_lbs
      : shipmentInfo.weight_lbs != null
        ? shipmentInfo.weight_lbs
        : shipment.weight;
  let numericWeight = typeof weightValue === 'number' ? weightValue : Number(weightValue);
  if (Number.isNaN(numericWeight)) numericWeight = null;

  const qtyValue =
    dimensions.pallets != null
      ? dimensions.pallets
      : (dimensions.quantity != null ? dimensions.quantity : null);
  let numericQty = typeof qtyValue === 'number' ? qtyValue : Number(qtyValue);
  if (Number.isNaN(numericQty)) numericQty = null;

  const description =
    shipment.commodity ||
    shipmentInfo.commodity ||
    output.description ||
    'Auto-imported from Email Paste workflow';

  const shipperAddress =
    pickup.address ||
    (pickup.street ? pickup.street : null) ||
    [pickup.city, pickup.state, pickup.zip].filter(Boolean).join(', ');
  const consigneeAddress =
    delivery.address ||
    (delivery.street ? delivery.street : null) ||
    [delivery.city, delivery.state, delivery.zip].filter(Boolean).join(', ');

  return {
    customer: customer,
    load_number: generateLoadNumber(),
    bill_to: output.sender && output.sender.email ? output.sender.email : (output.sender || null),
    dispatcher: output.recipient && output.recipient.company ? output.recipient.company : null,
    status: 'Pending',
    type: shipment.rate_type || billing.rate_type || 'Email Import',
    rate: numericRate,
    currency: 'USD',
    carrier_or_driver: null,
    equipment_type:
      shipment.truck_type ||
      shipmentInfo.truck_type ||
      output.truck_type ||
      null,
    shipper: shipperAddress || 'Pickup location pending',
    shipper_location: formatLocation(pickup),
    ship_date: pickup.date_time || pickup.requested_date_time || null,
    show_ship_time: true,
    description: description,
    qty: numericQty,
    weight: numericWeight,
    value: null,
    consignee: consigneeAddress || 'Consignee location pending',
    consignee_location: formatLocation(delivery),
    delivery_date: delivery.expected_date || delivery.date || null,
    show_delivery_time: true,
    delivery_notes: output.contact_email || (output.sender && output.sender.email) || null
  };
}

function extractOutputsFromAutomation(payload: any) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload
      .map(function(item) {
        if (!item || typeof item !== 'object') return null;
        if (item.output && typeof item.output === 'object') return item.output;
        return item;
      })
      .filter(Boolean);
  }
  if (payload.output && typeof payload.output === 'object') {
    return [payload.output];
  }
  if (typeof payload === 'object') {
    return [payload];
  }
  return [];
}

async function persistAutomationLoads(payload: any) {
  const outputs = extractOutputsFromAutomation(payload);
  if (!outputs.length) {
    throw new Error('Automation response did not include any load payloads.');
  }

  const saved: any[] = [];
  for (let i = 0; i < outputs.length; i++) {
    const record = buildLoadRecordFromOutput(outputs[i]);
    if (!record) {
      continue;
    }

    const columns = Object.keys(record);
    const values = columns.map(function(key) { return (record as any)[key]; });
    const placeholders = columns.map(function(_val, idx) { return '$' + (idx + 1); });
    const insertSql =
      'INSERT INTO loads (' + columns.join(',') + ') VALUES (' + placeholders.join(',') + ') RETURNING *';

    let attempts = 0;
    while (attempts < 3) {
      try {
        const result = await db.query(insertSql, values);
        saved.push(result.rows[0]);
        break;
      } catch (err: any) {
        if (err && err.code === '23505') {
          (record as any).load_number = generateLoadNumber();
          const loadIndex = columns.indexOf('load_number');
          values[loadIndex] = (record as any).load_number;
          attempts += 1;
          continue;
        }
        throw err;
      }
    }
  }

  if (!saved.length) {
    throw new Error('Automation response could not be mapped to a load record.');
  }

  return saved;
}

/* GET home page. */
router.get('/', function(_req: Request, res: Response) {
  res.render('index', { title: 'Express' });
});

router.post('/test-post', function(_req: Request, res: Response) {
  console.log("hello test-post");
  res.send('hello test-post');
});

// POST proxy to external calculate-rate API
router.post('/calculate-rate', function(req: Request, res: Response, next: NextFunction) {
  const payload = JSON.stringify(req.body || {});
  console.log("hello calculate-rate");

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
      res.status(apiRes.statusCode || 500);
      res.set('content-type', contentType);
      if (contentType.indexOf('application/json') > -1) {
        try {
          res.send(JSON.parse(data));
        } catch (e) {
          res.send(data);
        }
      } else {
        res.send(data);
      }
    });
  });

  apiReq.on('error', function(err) {
    next(err);
  });

  apiReq.write(payload);
  apiReq.end();
});

// POST to Forward Air quotes API with XML body
router.post('/forwardair-quote', function(req: Request, res: Response, next: NextFunction) {
  const body = req.body || {};
  const pickup = body.pickup || {};
  const pickupLoc = pickup.location || {};
  const delivery = body.delivery || {};
  const deliveryLoc = delivery.location || {};
  const pieces = body.pieces || {};
  const parts = Array.isArray(pieces.parts) ? pieces.parts : [];
  const firstPart = parts[0] || {};
  const weight = body.weight || {};

  function toWeightType(unit: string) {
    const u = String(unit || '').toLowerCase();
    if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'L';
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'K';
    return 'L';
  }

  function toYMD(dateInput: string) {
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
      res.status(apiRes.statusCode || 500);
      if (lowerContentType.indexOf('xml') > -1) {
        xml2js.parseString(
          data,
          { explicitArray: false, trim: true, explicitRoot: false },
          function(err, result) {
            if (err) {
              res.set('content-type', 'application/json');
              res.send({ error: 'Failed to parse XML response', raw: data });
            } else {
              res.set('content-type', 'application/json');
              res.send(result);
            }
          }
        );
      } else if (lowerContentType.indexOf('json') > -1) {
        try {
          res.set('content-type', 'application/json');
          res.send(JSON.parse(data));
        } catch (e) {
          res.set('content-type', 'application/json');
          res.send({ error: 'Invalid JSON from upstream', raw: data });
        }
      } else {
        res.set('content-type', 'application/json');
        res.send({ raw: data });
      }
    });
  });

  apiReq.on('error', function(err) {
    next(err);
  });

  apiReq.write(xmlBody);
  apiReq.end();
});

router.post('/api/email-paste', function(req: Request, res: Response, next: NextFunction) {
  const emailContent = (req.body && (req.body as any).content) || '';
  if (typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    res.status(400).json({ error: 'Email content is required' });
    return;
  }

  const n8nUrl = process.env.N8N_URL;
  if (!n8nUrl) {
    res.status(500).json({ error: 'N8N_URL env variable is not configured' });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(n8nUrl);
  } catch (_err) {
    res.status(500).json({ error: 'Invalid N8N_URL value' });
    return;
  }

  const payload = JSON.stringify({
    content: emailContent,
    meta: {
      length: emailContent.length,
      receivedAt: new Date().toISOString()
    }
  });

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const options = {
    method: 'POST',
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const upstreamReq = transport.request(options, function(upstreamRes) {
    let data = '';
    upstreamRes.on('data', function(chunk) { data += chunk; });
    upstreamRes.on('end', async function() {
      const contentType = upstreamRes.headers && upstreamRes.headers['content-type'] || 'application/json';
      const statusCode = upstreamRes.statusCode || 500;
      const isJson = contentType.indexOf('application/json') > -1;

      if (!isJson) {
        res.status(statusCode).type(contentType).send(data);
        return;
      }

      let parsed: any;
      try {
        parsed = data ? JSON.parse(data) : {};
      } catch (_err) {
        res.status(statusCode).send(data);
        return;
      }

      console.log(
        '[email-paste] n8n response',
        util.inspect(
          {
            statusCode: statusCode,
            contentType: contentType,
            parsedSample: parsed
          },
          { depth: null, maxArrayLength: null, breakLength: 120 }
        )
      );

      if (statusCode >= 200 && statusCode < 300) {
        try {
          await persistAutomationLoads(parsed);
        } catch (err) {
          next(err);
          return;
        }
      }

      res.status(statusCode).json(parsed);
    });
  });

  upstreamReq.on('error', function(err) {
    next(err);
  });

  upstreamReq.write(payload);
  upstreamReq.end();
});

export default router;

