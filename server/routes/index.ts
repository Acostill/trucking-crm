import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import https from 'https';
import util from 'util';
import { URL } from 'url';
import db from '../db';
import { getUserIdFromRequest } from '../utils/auth';
import {
  PickupLocation,
  DeliveryOption,
  Dimension,
  ShipmentInfo,
  ShipmentDetails,
  N8nEmailPasteResponse
} from '../types/n8n';
import { callExpediteAllAPI } from '../services/expediteAll';
import { callForwardAirAPI } from '../services/forwardAir';
import { generatePDFFromHTML } from '../services/pdfGenerator';
import { getUnifiedQuotes } from '../services/unifiedQuoteService';
import { UnifiedQuoteRequest } from '../types/quote';

const router = express.Router();

const DEFAULT_OPENROUTER_EMAIL_MODEL = 'meta-llama/llama-3.1-8b-instruct';
const DEFAULT_OPENROUTER_RATE_MODEL = 'meta-llama/llama-3.1-8b-instruct';

// Airport codes mapping for resolving airport codes to locations
const AIRPORT_CODES: Record<string, { city: string; state: string; zip: string }> = {
  'IAH': { city: 'Houston', state: 'TX', zip: '77032' }, // George Bush Intercontinental
  'HOU': { city: 'Houston', state: 'TX', zip: '77061' }, // William P. Hobby
  'LAX': { city: 'Los Angeles', state: 'CA', zip: '90045' },
  'JFK': { city: 'Jamaica', state: 'NY', zip: '11430' },
  'LGA': { city: 'Queens', state: 'NY', zip: '11371' },
  'EWR': { city: 'Newark', state: 'NJ', zip: '07114' },
  'ORD': { city: 'Chicago', state: 'IL', zip: '60666' },
  'MDW': { city: 'Chicago', state: 'IL', zip: '60638' },
  'DFW': { city: 'Dallas', state: 'TX', zip: '75261' },
  'DAL': { city: 'Dallas', state: 'TX', zip: '75235' },
  'ATL': { city: 'Atlanta', state: 'GA', zip: '30320' },
  'MIA': { city: 'Miami', state: 'FL', zip: '33126' },
  'FLL': { city: 'Fort Lauderdale', state: 'FL', zip: '33315' },
  'SEA': { city: 'Seattle', state: 'WA', zip: '98158' },
  'SFO': { city: 'San Francisco', state: 'CA', zip: '94128' },
  'DEN': { city: 'Denver', state: 'CO', zip: '80249' },
  'LAS': { city: 'Las Vegas', state: 'NV', zip: '89119' },
  'PHX': { city: 'Phoenix', state: 'AZ', zip: '85034' },
  'CLT': { city: 'Charlotte', state: 'NC', zip: '28208' },
  'BOS': { city: 'Boston', state: 'MA', zip: '02128' },
  'DTW': { city: 'Detroit', state: 'MI', zip: '48242' },
  'MSP': { city: 'Minneapolis', state: 'MN', zip: '55450' },
  'PHL': { city: 'Philadelphia', state: 'PA', zip: '19153' },
  'BWI': { city: 'Baltimore', state: 'MD', zip: '21240' },
  'DCA': { city: 'Arlington', state: 'VA', zip: '22202' },
  'IAD': { city: 'Dulles', state: 'VA', zip: '20166' },
  'SLC': { city: 'Salt Lake City', state: 'UT', zip: '84122' },
  'PDX': { city: 'Portland', state: 'OR', zip: '97218' },
  'STL': { city: 'St. Louis', state: 'MO', zip: '63145' },
  'MCI': { city: 'Kansas City', state: 'MO', zip: '64153' },
  'FCO': { city: 'El Paso', state: 'TX', zip: '79925' } // Fort Bliss/El Paso area
};

// Helper function to resolve airport codes in location data
function resolveAirportCode(location: any): any {
  if (!location || typeof location !== 'object') return location;
  
  const city = location.city || '';
  const upperCity = city.toUpperCase().trim();
  
  // Extract airport code if it's in format like "IAH airport" or just "IAH"
  let airportCode = upperCity;
  if (upperCity.includes(' ')) {
    // Try to extract 3-letter code from the beginning
    const match = upperCity.match(/^([A-Z]{3})\s/);
    if (match) {
      airportCode = match[1];
    }
  }
  
  // Check if city matches an airport code
  if (AIRPORT_CODES[airportCode]) {
    const airportInfo = AIRPORT_CODES[airportCode];
    return {
      ...location,
      city: airportInfo.city,
      state: location.state || airportInfo.state,
      zip: location.zip || airportInfo.zip
    };
  }
  
  return location;
}

function generateLoadNumber() {
  const random = Math.floor(Math.random() * 900) + 100; // 3-digit entropy
  return 'EMAIL-' + Date.now() + '-' + random;
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

async function parseEmailWithOpenRouter(emailContent: string): Promise<N8nEmailPasteResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err: any = new Error('OPENROUTER_API_KEY is not configured');
    err.status = 500;
    throw err;
  }

  const primaryModel =
    process.env.OPENROUTER_EMAIL_MODEL ||
    process.env.OPENROUTER_MODEL ||
    DEFAULT_OPENROUTER_EMAIL_MODEL;

  const modelCandidates = [primaryModel];
  if (primaryModel.endsWith(':free')) {
    modelCandidates.push(primaryModel.replace(/:free$/, ''));
  }
  if (modelCandidates.indexOf(DEFAULT_OPENROUTER_EMAIL_MODEL) === -1) {
    modelCandidates.push(DEFAULT_OPENROUTER_EMAIL_MODEL);
  }

  const prompt = [
    'You are an expert logistics email parser.',
    'Extract shipment details from the raw email text and return ONLY valid JSON (no markdown).',
    'Use this exact schema (omit fields you cannot determine):',
    '{',
    '  "subject": string,',
    '  "body": {',
    '    "greeting": string,',
    '    "message": string,',
    '    "shipment_details": {',
    '      "pickup": { "city": string, "state": string, "zip": string, "pickup_date": string, "pickup_ready_time": string, "pickup_close_time": string },',
    '      "delivery_options": [',
    '        { "location_code": string, "city": string, "state": string, "type": string, "zip_code": string, "requested_delivery_date": string, "delivery_time_window_start": string, "delivery_time_window_end": string }',
    '      ],',
    '      "shipment_info": {',
    '        "pallets": number,',
    '        "dimensions": [ { "length_in": number, "width_in": number, "height_in": number, "count": number } ],',
    '        "total_weight_lbs": number,',
    '        "commodity": string,',
    '        "stackable": boolean,',
    '        "temperature_control": { "min_c": number, "max_c": number },',
    '        "data_loggers_required": number,',
    '        "ready_for_loading_date": string,',
    '        "cut_off_time_for_trucking": string',
    '      }',
    '    },',
    '    "special_instructions": {',
    '      "notes": string[],',
    '      "requirements": string[],',
    '      "driver_requirements": string[],',
    '      "security_requirements": string[],',
    '      "accessorials": string[],',
    '      "compliance_flags": string[],',
    '      "extra_fields": object',
    '    }',
    '  }',
    '}',
    'If a list has no items, return an empty array.',
    'Do not include any additional keys.',
    '',
    'EMAIL TEXT:',
    emailContent
  ].join('\n');

  let lastErrorText: string | null = null;
  let data: any = null;
  let chosenModel: string | null = null;

  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trucking-crm.app',
        'X-Title': 'Trucking CRM Email Paste'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 900
      })
    });

    if (response.ok) {
      data = await response.json();
      chosenModel = model;
      break;
    }

    lastErrorText = await response.text();

    // If model isn't found, try the next candidate.
    if (response.status === 404) {
      continue;
    }

    const err: any = new Error(`OpenRouter API error: ${response.status}`);
    err.status = 502;
    err.details = { raw: lastErrorText, model };
    throw err;
  }

  if (!data) {
    const err: any = new Error('OpenRouter API error: 404');
    err.status = 502;
    err.details = { raw: lastErrorText, triedModels: modelCandidates };
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err: any = new Error('No content in OpenRouter response');
    err.status = 502;
    err.details = { model: chosenModel };
    throw err;
  }

  const jsonStr = stripJsonFence(String(content));
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('OpenRouter response was not a JSON object');
    }
    return parsed as N8nEmailPasteResponse;
  } catch (parseErr: any) {
    const err: any = new Error('Failed to parse JSON from OpenRouter response');
    err.status = 502;
    err.details = { raw: content, parseError: parseErr?.message, model: chosenModel };
    throw err;
  }
}

async function parseCalculateRateWithOpenRouter(inputText: string): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err: any = new Error('OPENROUTER_API_KEY is not configured');
    err.status = 500;
    throw err;
  }

  const primaryModel =
    process.env.OPENROUTER_RATE_MODEL ||
    process.env.OPENROUTER_MODEL ||
    DEFAULT_OPENROUTER_RATE_MODEL;

  const modelCandidates = [primaryModel];
  if (primaryModel.endsWith(':free')) {
    modelCandidates.push(primaryModel.replace(/:free$/, ''));
  }
  if (modelCandidates.indexOf(DEFAULT_OPENROUTER_RATE_MODEL) === -1) {
    modelCandidates.push(DEFAULT_OPENROUTER_RATE_MODEL);
  }

  const airportCodesList = Object.entries(AIRPORT_CODES)
    .map(([code, loc]) => `  ${code}: ${loc.city}, ${loc.state} ${loc.zip}`)
    .join('\n');

  const prompt = [
    'You extract shipping quote details from user instructions.',
    'Return ONLY valid JSON (no markdown). Use this schema and omit unknown fields:',
    '{',
    '  "pickup": { "city": string, "state": string, "zip": string, "country": string, "date": string },',
    '  "delivery": { "city": string, "state": string, "zip": string, "country": string, "date": string },',
    '  "pieces": { "unit": string, "parts": [ { "length": number, "width": number, "height": number, "weight": number, "count": number } ] },',
    '  "weight": { "unit": string, "value": number },',
    '  "equipmentType": string,',
    '  "accessorialCodes": string[],',
    '  "hazardousUnNumbers": string[],',
    '  "shipmentId": string,',
    '  "referenceNumber": string',
    '}',
    'If no parts are provided, return an empty array. If no arrays, return empty arrays.',
    '',
    'IMPORTANT: For pieces, if the user specifies a quantity (e.g., "2 pallets", "3 crates"), set the "count" field to that number.',
    'Example: "2 pallets @ 43.3x48x64.9 in each" should have count: 2 with length: 43.3, width: 48, height: 64.9.',
    'If no quantity is specified, default count to 1.',
    '',
    'AIRPORT CODES: If the user mentions an airport code (3-letter code like IAH, LAX, JFK) or "airport",',
    'you MUST look up the proper city, state, and zip code for that airport. Common airport codes:',
    airportCodesList,
    'If you encounter an airport code not in this list, use your knowledge to provide the correct city, state, and zip.',
    'Do NOT use the airport code as the city name. Always use the actual city name where the airport is located.',
    '',
    'USER INPUT:',
    inputText
  ].join('\n');

  let lastErrorText: string | null = null;
  let data: any = null;
  let chosenModel: string | null = null;

  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trucking-crm.app',
        'X-Title': 'Trucking CRM Rate Parser'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 900
      })
    });

    if (response.ok) {
      data = await response.json();
      chosenModel = model;
      break;
    }

    lastErrorText = await response.text();
    if (response.status === 404) {
      continue;
    }

    const err: any = new Error(`OpenRouter API error: ${response.status}`);
    err.status = 502;
    err.details = { raw: lastErrorText, model };
    throw err;
  }

  if (!data) {
    const err: any = new Error('OpenRouter API error: 404');
    err.status = 502;
    err.details = { raw: lastErrorText, triedModels: modelCandidates };
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err: any = new Error('No content in OpenRouter response');
    err.status = 502;
    err.details = { model: chosenModel };
    throw err;
  }

  const jsonStr = stripJsonFence(String(content));
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('OpenRouter response was not a JSON object');
    }
    
    // Post-process to resolve airport codes
    if (parsed.pickup) {
      parsed.pickup = resolveAirportCode(parsed.pickup);
    }
    if (parsed.delivery) {
      parsed.delivery = resolveAirportCode(parsed.delivery);
    }
    
    return parsed;
  } catch (parseErr: any) {
    const err: any = new Error('Failed to parse JSON from OpenRouter response');
    err.status = 502;
    err.details = { raw: content, parseError: parseErr?.message, model: chosenModel };
    throw err;
  }
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

async function persistAutomationLoads(
  req: Request | null,
  payload: N8nEmailPasteResponse | N8nEmailPasteResponse[] | null | undefined
) {
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
        const userId = req ? await getUserIdFromRequest(req) : null;
        const result = await db.queryWithUser(insertSql, values, userId || undefined);
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

// POST proxy to external calculate-rate API - now unified to call all three APIs
router.post('/calculate-rate', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const body: UnifiedQuoteRequest = req.body || {};
    
    // Get unified quotes from all three APIs
    const unifiedResponse = await getUnifiedQuotes(body);

    // Helper function to check if a quote has a valid total
    function isValidQuote(quote: any): boolean {
      if (!quote || typeof quote !== 'object') return false;
      if (quote.error) return false; // Exclude quotes with errors
      
      // Check both total and lineHaul (some quotes might only have lineHaul)
      const total = quote.total;
      const lineHaul = quote.lineHaul;
      
      // Exclude quotes with invalid totals (0, null, undefined, NaN)
      const hasValidTotal = total !== null && total !== undefined && total !== 0 && !Number.isNaN(total);
      const hasValidLineHaul = lineHaul !== null && lineHaul !== undefined && lineHaul !== 0 && !Number.isNaN(lineHaul);
      
      // Quote is valid if it has either a valid total or valid lineHaul
      return hasValidTotal || hasValidLineHaul;
    }

    // Filter out quotes with invalid totals
    const filteredResponse: any = {};
    if (isValidQuote(unifiedResponse.expediteAll)) {
      filteredResponse.expediteAll = unifiedResponse.expediteAll;
    }
    if (isValidQuote(unifiedResponse.forwardAir)) {
      filteredResponse.forwardAir = unifiedResponse.forwardAir;
    }
    if (isValidQuote(unifiedResponse.datForecast)) {
      filteredResponse.datForecast = unifiedResponse.datForecast;
    }

    // Return filtered response
    res.status(200).json(filteredResponse);
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
          await persistAutomationLoads(req, parsed);
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

router.post('/api/email-paste/openrouter', async function(req: Request, res: Response, next: NextFunction) {
  const emailContent = (req.body && (req.body as any).content) || '';
  if (typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    res.status(400).json({ error: 'Email content is required' });
    return;
  }

  try {
    const parsed = await parseEmailWithOpenRouter(emailContent);

    console.log(
      '[email-paste-openrouter] response',
      util.inspect({ parsed }, { depth: null, maxArrayLength: null, breakLength: 120 })
    );

    res.status(200).json(parsed);
  } catch (err) {
    next(err);
  }
});

router.post('/api/ai/parse-calculate-rate', async function(req: Request, res: Response, next: NextFunction) {
  const content = (req.body && (req.body as any).content) || '';
  if (typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'Input content is required' });
    return;
  }

  try {
    const parsed = await parseCalculateRateWithOpenRouter(content);
    res.status(200).json(parsed);
  } catch (err) {
    next(err);
  }
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
        const userId = await getUserIdFromRequest(req);
        const result = await db.queryWithUser(insertSql, values, userId || undefined);
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

