import assert from 'assert';
import db from '../db';
import {
  DAT_SEARCH_LOADS_WORKFLOW_ID,
  queueAutomaticDatLookups,
  requestDatLookups,
  requestDatRateViewLookup
} from '../services/datRateViewJobs';
import {
  applyExplicitTemperatureService,
  parsedEmailToShipmentRequest,
  validateShipmentRequest
} from '../services/emailQuoteWorkflow';

const quoteId = 'email-quote-automatic-dat-test';
const userId = '11111111-1111-4111-8111-111111111111';

class FakeQueueClient {
  quote: any = {
    id: quoteId,
    status: 'needs_review',
    shipment_request: {
      pickup: {
        location: { city: 'Portland', state: 'OR' },
        date: '2099-09-03T12:00:00.000Z'
      },
      delivery: { location: { city: 'Chicago', state: 'IL' } },
      datEquipmentType: 'Van'
    },
    carrier_quotes: [
      { key: 'forwardAir', source: 'Forward Air', available: false, error: 'No rate returned' }
    ]
  };
  jobs: any[] = [];

  async query(sql: string, params: any[] = []): Promise<any> {
    const statement = sql.replace(/\s+/g, ' ').trim();
    if (statement.startsWith('SELECT * FROM public.email_quote_requests')) {
      return { rows: params[0] === this.quote.id ? [this.quote] : [] };
    }
    if (statement.startsWith('UPDATE public.dat_rateview_jobs SET status = \'cancelled\'')) {
      for (const job of this.jobs) {
        if (
          job.email_quote_request_id === params[0] &&
          job.request_fingerprint !== params[1] &&
          job.status === 'pending' &&
          job.input_payload.workflowId === params[2]
        ) job.status = 'cancelled';
      }
      return { rows: [] };
    }
    if (statement.startsWith('SELECT * FROM public.dat_rateview_jobs')) {
      return {
        rows: this.jobs.filter(function(job) {
          return job.email_quote_request_id === params[0] && job.request_fingerprint === params[1];
        })
      };
    }
    if (statement.startsWith('INSERT INTO public.dat_rateview_jobs')) {
      const job = {
        id: params[0],
        email_quote_request_id: params[1],
        request_fingerprint: params[2],
        status: 'pending',
        input_payload: JSON.parse(params[3]),
        approved_by: params[4],
        approved_at: new Date().toISOString(),
        result_payload: null,
        error_message: null
      };
      this.jobs.push(job);
      return { rows: [job] };
    }
    if (statement.startsWith('UPDATE public.dat_rateview_jobs SET status = \'pending\'')) {
      const job = this.jobs.find(function(value) { return value.id === params[0]; });
      if (!job) return { rows: [] };
      job.status = 'pending';
      job.input_payload = JSON.parse(params[1]);
      job.approved_by = params[2];
      job.error_message = null;
      return { rows: [job] };
    }
    if (statement.startsWith('UPDATE public.email_quote_requests SET carrier_quotes')) {
      this.quote.carrier_quotes = JSON.parse(params[1]);
      return { rows: [this.quote] };
    }
    throw new Error(`Unhandled fake SQL: ${statement}`);
  }
}

async function run() {
  const originalEnabled = process.env.DAT_WORKER_ENABLED;
  const originalTransaction = db.transactionWithUser;
  const client = new FakeQueueClient();
  process.env.DAT_WORKER_ENABLED = 'true';
  (db as any).transactionWithUser = async function(callback: (value: FakeQueueClient) => Promise<any>) {
    return callback(client);
  };

  try {
    const missingDateShipment = parsedEmailToShipmentRequest({
      output: {
        parsedSample: {
          body: {
            shipment_details: {
              pickup: { city: 'Portland', state: 'OR' },
              delivery: { city: 'Chicago', state: 'IL' },
              shipment_info: {
                pallets: 1,
                total_weight_lbs: 500,
                dimensions: [{ count: 1, length_in: 48, width_in: 40, height_in: 48 }]
              }
            }
          }
        }
      }
    } as any);
    assert.strictEqual(missingDateShipment.pickup?.date, undefined, 'the parser must not invent a DAT pickup date');
    assert(validateShipmentRequest(missingDateShipment).missing.includes('pickup date'));
    assert(validateShipmentRequest({
      ...missingDateShipment,
      pickup: { ...missingDateShipment.pickup, date: '2000-01-01T12:00:00.000Z' }
    }).missing.includes('current or future pickup date'));

    const hallucinatedReefer = parsedEmailToShipmentRequest({
      output: {
        parsedSample: {
          body: {
            shipment_details: {
              pickup: { city: 'Selma', state: 'CA', zip: '93662', pickup_date: '2099-09-08' },
              delivery: { city: 'Los Angeles', state: 'CA', zip_code: '90001' },
              shipment_info: {
                pallets: 2,
                total_weight_lbs: 1900,
                dimensions: [{ count: 2, length_in: 48, width_in: 40, height_in: 52 }],
                temperature_control: { min_c: 2, max_c: 8 }
              }
            }
          }
        }
      }
    } as any);
    assert.strictEqual(hallucinatedReefer.truckType, 'Reefer Cargo Van');
    const correctedDry = applyExplicitTemperatureService(
      hallucinatedReefer,
      'Commodity: General merchandise\nDry freight\nNon-hazardous'
    );
    assert.strictEqual(correctedDry.temperatureControlled, false);
    assert.strictEqual(correctedDry.temperatureControl, undefined);
    assert.strictEqual(correctedDry.truckType, 'Cargo Van');
    assert.strictEqual(correctedDry.datEquipmentType, 'Van');

    await queueAutomaticDatLookups(quoteId);
    assert.strictEqual(client.jobs.length, 2, 'automatic pricing must queue RateView and Search Loads');
    assert(client.jobs.every(function(job) { return job.status === 'pending'; }));
    assert(client.jobs.every(function(job) { return job.approved_by === null; }), 'automatic jobs use system authorization');
    assert(client.jobs.some(function(job) {
      return job.input_payload.workflowId === DAT_SEARCH_LOADS_WORKFLOW_ID;
    }), 'Search Loads job must use the approved workflow contract');

    await queueAutomaticDatLookups(quoteId);
    assert.strictEqual(client.jobs.length, 2, 'the same shipment fingerprints must be idempotent');

    const rateViewJob = client.jobs.find(function(job) { return !job.input_payload.workflowId; });
    rateViewJob.status = 'needs_auth';
    rateViewJob.error_message = 'Sign in required';
    await queueAutomaticDatLookups(quoteId);
    assert.strictEqual(rateViewJob.status, 'needs_auth', 'automatic processing must not retry an auth failure');

    await requestDatRateViewLookup(quoteId, userId);
    assert.strictEqual(rateViewJob.status, 'pending', 'an authenticated staff retry can reset a pre-submit failure');
    assert.strictEqual(rateViewJob.approved_by, userId);

    rateViewJob.status = 'uncertain';
    client.quote.status = 'ready';
    client.jobs = client.jobs.filter(function(job) {
      return job.input_payload.workflowId !== DAT_SEARCH_LOADS_WORKFLOW_ID;
    });
    await requestDatLookups(quoteId, userId);
    assert.strictEqual(rateViewJob.status, 'uncertain', 'combined retry must preserve an uncertain RateView lookup');
    const manualSearchLoadsJob = client.jobs.find(function(job) {
      return job.input_payload.workflowId === DAT_SEARCH_LOADS_WORKFLOW_ID;
    });
    assert(manualSearchLoadsJob, 'combined retry must independently queue missing Search Loads');
    assert.strictEqual(manualSearchLoadsJob.approved_by, userId);

    console.log('Automatic connected-pricing DAT queue tests passed.');
  } finally {
    (db as any).transactionWithUser = originalTransaction;
    if (originalEnabled == null) delete process.env.DAT_WORKER_ENABLED;
    else process.env.DAT_WORKER_ENABLED = originalEnabled;
  }
}

run().finally(function() {
  db.pool.end();
});
