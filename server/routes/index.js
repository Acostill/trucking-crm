var express = require('express');
var https = require('https');
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

module.exports = router;
