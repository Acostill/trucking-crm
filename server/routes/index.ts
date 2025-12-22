import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import https from 'https';
import util from 'util';
import { URL } from 'url';
import db from '../db';
import {
  PickupLocation,
  DeliveryOption,
  Dimension,
  ShipmentInfo,
  ShipmentDetails,
  N8nEmailPasteResponse
} from '../types/n8n';
import { callCalculateRateAPI } from '../services/calculateRate';
import { callForwardAirAPI } from '../services/forwardAir';
import { generatePDFFromHTML } from '../services/pdfGenerator';

const router = express.Router();

function generateLoadNumber() {
  const random = Math.floor(Math.random() * 900) + 100; // 3-digit entropy
  return 'EMAIL-' + Date.now() + '-' + random;
}

function formatLocation(location: PickupLocation | DeliveryOption | null | undefined): string | null {
  if (!location || typeof location !== 'object') return null;
  const segments: string[] = [];
  if (location.city) segments.push(location.city);
  if (location.state) segments.push(location.state);
  const cityState = segments.length ? segments.join(', ') : null;
  const zip = (location as DeliveryOption).zip_code || (location as PickupLocation).zip 
    ? String((location as DeliveryOption).zip_code || (location as PickupLocation).zip) 
    : null;
  if (cityState && zip) return cityState + ' ' + zip;
  return cityState || zip || null;
}

function buildLoadRecordFromOutput(output: N8nEmailPasteResponse | null | undefined) {
  if (!output || typeof output !== 'object') return null;

  // Handle new structure where shipment_details is directly in body
  const shipment =
    output.shipment ||
    (output.body && output.body.shipment_details) ||
    (output as any).shipment_details ||
    {};

  const pickup =
    shipment.pickup ||
    (shipment.shipment && shipment.shipment.pickup) ||
    {};
  // New structure: delivery_options is an array, take the first one
  const deliveryOptions = shipment.delivery_options || [];
  const delivery =
    shipment.delivery ||
    (shipment.shipment && shipment.shipment.delivery) ||
    (deliveryOptions.length > 0 ? deliveryOptions[0] : {});

  const shipmentInfo = shipment.shipment_info || shipment.shipmentInfo || {};
  const billing = output.billing || {};
  // New structure: dimensions is an array, take the first one
  const dimsArray = shipmentInfo.dimensions || shipment.dimensions || [];
  const dimensions = Array.isArray(dimsArray) ? (dimsArray[0] || {}) : (dimsArray || {});

  // Try to extract customer from various possible locations
  const outputAny = output as any;
  const customer =
    output.client_name ||
    (output.sender && (output.sender.company || output.sender.name)) ||
    output.sender ||
    (outputAny.subject ? `Customer from ${outputAny.subject}` : null) ||
    'Unknown Customer';
  
  // Don't return null if customer is missing, use default instead
  if (!customer) {
    console.warn('[buildLoadRecordFromOutput] No customer found, using default');
  }

  const rateValue =
    shipment.rate != null
      ? shipment.rate
      : billing.rate != null
        ? billing.rate
        : shipment.payment_terms && shipment.payment_terms.rate;
  let numericRate = typeof rateValue === 'number' ? rateValue : Number(rateValue);
  if (Number.isNaN(numericRate)) numericRate = null;

  const weightValue =
    shipmentInfo.total_weight_lbs != null
      ? shipmentInfo.total_weight_lbs
      : shipment.shipment_weight_lbs != null
        ? shipment.shipment_weight_lbs
        : shipmentInfo.weight_lbs != null
          ? shipmentInfo.weight_lbs
          : shipment.weight;
  let numericWeight = typeof weightValue === 'number' ? weightValue : Number(weightValue);
  if (Number.isNaN(numericWeight)) numericWeight = null;

  const qtyValue =
    shipmentInfo.pallets != null
      ? shipmentInfo.pallets
      : dimensions.pallets != null
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
  const deliveryZip = delivery.zip_code || delivery.zip;
  const consigneeAddress =
    delivery.address ||
    (delivery.street ? delivery.street : null) ||
    [delivery.city, delivery.state, deliveryZip].filter(Boolean).join(', ');

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
    ship_date: pickup.pickup_date || pickup.date_time || pickup.requested_date_time || null,
    show_ship_time: true,
    description: description,
    qty: numericQty,
    weight: numericWeight,
    value: null,
    consignee: consigneeAddress || 'Consignee location pending',
    consignee_location: formatLocation(delivery),
    delivery_date: delivery.requested_delivery_date || delivery.expected_date || delivery.date || null,
    show_delivery_time: true,
    delivery_notes: output.contact_email || (output.sender && output.sender.email) || null
  };
}

function extractOutputsFromAutomation(payload: any): N8nEmailPasteResponse[] {
  if (!payload) return [];
  
  // Handle new structure with parsedSample wrapper
  if (payload.parsedSample && typeof payload.parsedSample === 'object') {
    // Unwrap parsedSample - the body contains shipment_details
    // We need to structure it so buildLoadRecordFromOutput can find it
    const parsedBody = payload.parsedSample.body;
    if (parsedBody && parsedBody.shipment_details) {
      // Structure it as { body: { shipment_details: ... } } for compatibility
      return [{
        body: {
          shipment_details: parsedBody.shipment_details
        },
        subject: payload.parsedSample.subject
      } as N8nEmailPasteResponse];
    }
    // Fallback: return the body directly
    return [parsedBody as N8nEmailPasteResponse];
  }
  
  if (Array.isArray(payload)) {
    return payload
      .map(function(item) {
        if (!item || typeof item !== 'object') return null;
        // Handle parsedSample in array items
        if (item.parsedSample && typeof item.parsedSample === 'object') {
          const parsedBody = item.parsedSample.body;
          if (parsedBody && parsedBody.shipment_details) {
            return {
              body: {
                shipment_details: parsedBody.shipment_details
              },
              subject: item.parsedSample.subject
            } as N8nEmailPasteResponse;
          }
          return parsedBody as N8nEmailPasteResponse;
        }
        if (item.output && typeof item.output === 'object') return item.output as N8nEmailPasteResponse;
        return item as N8nEmailPasteResponse;
      })
      .filter((item): item is N8nEmailPasteResponse => item !== null);
  }
  if (payload.output && typeof payload.output === 'object') {
    return [payload.output];
  }
  if (typeof payload === 'object') {
    return [payload];
  }
  return [];
}

async function persistAutomationLoads(payload: N8nEmailPasteResponse | N8nEmailPasteResponse[] | null | undefined) {
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

// POST proxy to external calculate-rate API - now unified to call both APIs
router.post('/calculate-rate', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    
    // Call both APIs in parallel
    const [calculateRateResult, forwardAirResult] = await Promise.allSettled([
      callCalculateRateAPI(body),
      callForwardAirAPI(body)
    ]);

    // Extract results, handling both success and failure cases
    const calculateRate = calculateRateResult.status === 'fulfilled' 
      ? calculateRateResult.value.data 
      : { error: calculateRateResult.reason?.message || 'Failed to fetch calculate-rate quote' };
    
    const forwardAir = forwardAirResult.status === 'fulfilled' 
      ? forwardAirResult.value.data 
      : { error: forwardAirResult.reason?.message || 'Failed to fetch Forward Air quote' };

    // Return combined response
    res.status(200).json({
      calculateRate: calculateRate,
      forwardAir: forwardAir
    });
  } catch (err) {
    next(err);
  }
});

// POST to Forward Air quotes API with XML body (backward compatibility endpoint)
router.post('/forwardair-quote', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await callForwardAirAPI(req.body);
    res.status(result.statusCode).json(result.data);
  } catch (err) {
    next(err);
  }
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

// POST endpoint to save a load after selecting a quote
router.post('/api/email-paste/save-load', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { payload, quote, contact } = req.body || {};
    
    if (!payload) {
      res.status(400).json({ error: 'Payload is required' });
      return;
    }

    // Extract the load record from the payload
    const outputs = extractOutputsFromAutomation(payload);
    if (!outputs.length) {
      res.status(400).json({ error: 'Payload did not include any load data' });
      return;
    }

    // Build load record from the first output
    const record = buildLoadRecordFromOutput(outputs[0]);
    if (!record) {
      res.status(400).json({ error: 'Could not build load record from payload' });
      return;
    }

    // Add quote information to the load record
    if (quote && typeof quote === 'object') {
      if (quote.priceTotal != null) {
        (record as any).rate = typeof quote.priceTotal === 'number' 
          ? quote.priceTotal 
          : Number(quote.priceTotal) || (record as any).rate;
      }
      if (quote.truckType) {
        (record as any).equipment_type = quote.truckType;
      }
    }

    // Add contact information if provided
    if (contact && typeof contact === 'object') {
      if (contact.email) {
        (record as any).delivery_notes = contact.email;
      }
      if (contact.name) {
        // Could store contact name in a separate field if needed
        (record as any).customer = contact.name;
      }
    }

    // Insert into database
    const columns = Object.keys(record);
    const values = columns.map(function(key) { return (record as any)[key]; });
    const placeholders = columns.map(function(_val, idx) { return '$' + (idx + 1); });
    const insertSql =
      'INSERT INTO loads (' + columns.join(',') + ') VALUES (' + placeholders.join(',') + ') RETURNING *';

    let attempts = 0;
    let saved: any = null;
    while (attempts < 3) {
      try {
        const result = await db.query(insertSql, values);
        saved = result.rows[0];
        break;
      } catch (err: any) {
        if (err && err.code === '23505') {
          // Duplicate key error - regenerate load number and retry
          (record as any).load_number = generateLoadNumber();
          const loadIndex = columns.indexOf('load_number');
          values[loadIndex] = (record as any).load_number;
          attempts += 1;
          continue;
        }
        throw err;
      }
    }

    if (!saved) {
      res.status(500).json({ error: 'Failed to save load after multiple attempts' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      load: saved,
      message: 'Load saved successfully'
    });
  } catch (err) {
    console.error('Error saving load:', err);
    next(err);
  }
});

// POST endpoint to generate PDF from HTML content
router.post('/api/generate-pdf', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { html, options } = req.body || {};
    
    if (!html || typeof html !== 'string') {
      res.status(400).json({ error: 'HTML content is required' });
      return;
    }

    // Generate PDF from HTML
    const pdfBuffer = await generatePDFFromHTML(html, options);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length.toString());

    // Send PDF buffer
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);
    next(err);
  }
});

export default router;

