var express = require('express');
var https = require('https');
var xml2js = require('xml2js');
var router = express.Router();

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

module.exports = router;
