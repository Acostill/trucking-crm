import https from 'https';

/**
 * Calls the external calculate-rate API
 * @param body - The request body to send to the API
 * @returns Promise resolving to an object with statusCode and data
 */
export function callCalculateRateAPI(body: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
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
        if (contentType.indexOf('application/json') > -1) {
          try {
            resolve({ statusCode: apiRes.statusCode || 500, data: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: apiRes.statusCode || 500, data: data });
          }
        } else {
          resolve({ statusCode: apiRes.statusCode || 500, data: data });
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

