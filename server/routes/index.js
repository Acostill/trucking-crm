var express = require('express');
var http = require('http');
var https = require('https');
var xml2js = require('xml2js');
var router = express.Router();
var URL = require('url').URL;
var db = require('../db');

function generateLoadNumber() {
  var random = Math.floor(Math.random() * 900) + 100; // 3-digit entropy
  return 'EMAIL-' + Date.now() + '-' + random;
}

function formatLocation(location) {
  if (!location || typeof location !== 'object') return null;
  var segments = [];
  if (location.city) segments.push(location.city);
  if (location.state) segments.push(location.state);
  var cityState = segments.length ? segments.join(', ') : null;
  var zip = location.zip ? String(location.zip) : null;
  if (cityState && zip) return cityState + ' ' + zip;
  return cityState || zip || null;
}

function buildLoadRecordFromOutput(output) {
  if (!output || typeof output !== 'object') return null;
  var shipment = output.shipment || {};
  var pickup = shipment.pickup || {};
  var delivery = shipment.delivery || {};

  var customer = output.client_name || output.sender;
  if (!customer) return null;

  var rateValue = shipment.rate;
  var numericRate = typeof rateValue === 'number' ? rateValue : Number(rateValue);
  if (Number.isNaN(numericRate)) numericRate = null;

  return {
    customer: customer,
    load_number: generateLoadNumber(),
    bill_to: output.sender || null,
    status: 'Pending',
    type: shipment.rate_type || 'Email Import',
    rate: numericRate,
    currency: 'USD',
    shipper: pickup.address || 'Pickup location pending',
    shipper_location: formatLocation(pickup),
    consignee: delivery.address || 'Consignee location pending',
    consignee_location: formatLocation(delivery),
    description: 'Auto-imported from Email Paste workflow',
    delivery_notes: output.contact_email ? 'Primary contact: ' + output.contact_email : null
  };
}

function extractOutputsFromAutomation(payload) {
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

async function persistAutomationLoads(payload) {
  var outputs = extractOutputsFromAutomation(payload);
  if (!outputs.length) {
    throw new Error('Automation response did not include any load payloads.');
  }

  var saved = [];
  for (var i = 0; i < outputs.length; i++) {
    var record = buildLoadRecordFromOutput(outputs[i]);
    if (!record) {
      continue;
    }

    var columns = Object.keys(record);
    var values = columns.map(function(key) { return record[key]; });
    var placeholders = columns.map(function(_val, idx) { return '$' + (idx + 1); });
    var insertSql =
      'INSERT INTO loads (' + columns.join(',') + ') VALUES (' + placeholders.join(',') + ') RETURNING *';

    var attempts = 0;
    while (attempts < 3) {
      try {
        var result = await db.query(insertSql, values);
        saved.push(result.rows[0]);
        break;
      } catch (err) {
        if (err && err.code === '23505') {
          record.load_number = generateLoadNumber();
          var loadIndex = columns.indexOf('load_number');
          values[loadIndex] = record.load_number;
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
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/test-post', function(req, res, next) {
  console.log("hello test-post");
  res.send('hello test-post');
});

// POST proxy to external calculate-rate API
router.post('/calculate-rate', function(req, res, next) {
  var payload = JSON.stringify(req.body || {});
  console.log("hello calculate-rate");

  var options = {
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

  var apiReq = https.request(options, function(apiRes) {
    var data = '';
    apiRes.on('data', function(chunk) { data += chunk; });
    apiRes.on('end', function() {
      var contentType = (apiRes.headers && apiRes.headers['content-type']) || 'application/json';
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
router.post('/forwardair-quote', function(req, res, next) {
  var body = req.body || {};
  var pickup = body.pickup || {};
  var pickupLoc = pickup.location || {};
  var delivery = body.delivery || {};
  var deliveryLoc = delivery.location || {};
  var pieces = body.pieces || {};
  var parts = Array.isArray(pieces.parts) ? pieces.parts : [];
  var firstPart = parts[0] || {};
  var weight = body.weight || {};

  function toWeightType(unit) {
    var u = String(unit || '').toLowerCase();
    if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'L';
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'K';
    return 'L';
  }

  function toYMD(dateInput) {
    try {
      var d = dateInput ? new Date(dateInput) : new Date();
      var year = d.getUTCFullYear();
      var month = String(d.getUTCMonth() + 1).padStart(2, '0');
      var day = String(d.getUTCDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    } catch (_e) {
      return '2020-11-02';
    }
  }

  var xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
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

  var options = {
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

  var apiReq = https.request(options, function(apiRes) {
    var data = '';
    apiRes.on('data', function(chunk) { data += chunk; });
    apiRes.on('end', function() {
      var contentType = (apiRes.headers && apiRes.headers['content-type']) || 'application/xml';
      var lowerContentType = String(contentType || '').toLowerCase();
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

router.post('/api/email-paste', function(req, res, next) {
  var emailContent = (req.body && req.body.content) || '';
  if (typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    res.status(400).json({ error: 'Email content is required' });
    return;
  }

  var n8nUrl = process.env.N8N_URL;
  if (!n8nUrl) {
    res.status(500).json({ error: 'N8N_URL env variable is not configured' });
    return;
  }

  var targetUrl;
  try {
    targetUrl = new URL(n8nUrl);
  } catch (_err) {
    res.status(500).json({ error: 'Invalid N8N_URL value' });
    return;
  }

  var payload = JSON.stringify({
    content: emailContent,
    meta: {
      length: emailContent.length,
      receivedAt: new Date().toISOString()
    }
  });

  var transport = targetUrl.protocol === 'https:' ? https : http;
  var options = {
    method: 'POST',
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  var upstreamReq = transport.request(options, function(upstreamRes) {
    var data = '';
    upstreamRes.on('data', function(chunk) { data += chunk; });
    upstreamRes.on('end', async function() {
      var contentType = upstreamRes.headers && upstreamRes.headers['content-type'] || 'application/json';
      var statusCode = upstreamRes.statusCode || 500;
      var isJson = contentType.indexOf('application/json') > -1;

      if (!isJson) {
        res.status(statusCode).type(contentType).send(data);
        return;
      }

      var parsed;
      try {
        parsed = data ? JSON.parse(data) : {};
      } catch (_err) {
        res.status(statusCode).send(data);
        return;
      }

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

module.exports = router;
