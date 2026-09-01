import assert from 'assert';
import db from '../db';
import {
  buildDatRateViewRequest,
  claimDatRateViewJob,
  completeDatRateViewJob,
  failDatRateViewJob,
  startDatRateViewJob
} from '../services/datRateViewJobs';

const workerId = 'worker-test';
const quoteId = 'email-quote-worker-test';
const shipment = {
  pickup: { location: { city: 'Portland', state: 'OR' } },
  delivery: { location: { city: 'Chicago', state: 'IL' } },
  datEquipmentType: 'Van'
};
const candidate = buildDatRateViewRequest(quoteId, shipment);
if (!candidate) throw new Error('Expected a valid DAT test request');

const completedResult = {
  requestId: candidate.request.requestId,
  source: 'DAT RateView',
  lookupTimestamp: '2026-08-11T12:00:00.000Z',
  acceptedOrigin: 'Portland, OR',
  acceptedDestination: 'Chicago, IL',
  acceptedEquipmentType: 'Van',
  spot: {
    rateType: 'SPOT',
    acceptedMarketLane: 'Portland, OR → Chicago, IL',
    averageTotalUsd: 3729,
    averagePerMileUsd: 1.75,
    lowTotalUsd: 3197,
    highTotalUsd: 4092,
    lowPerMileUsd: 1.5,
    highPerMileUsd: 1.92,
    miles: 2131,
    timeframe: '7 days'
  },
  contract: {
    rateType: 'CONTRACT',
    acceptedMarketLane: 'Portland, OR → Chicago, IL',
    averageTotalUsd: 3836,
    averagePerMileUsd: 1.8,
    lowTotalUsd: 3367,
    highTotalUsd: 4539,
    lowPerMileUsd: 1.58,
    highPerMileUsd: 2.13,
    miles: 2131,
    timeframe: '90 days'
  }
};

function newJob(status: string) {
  return {
    id: 'dat-job-worker-test',
    email_quote_request_id: quoteId,
    request_fingerprint: candidate!.fingerprint,
    status,
    input_payload: candidate!.request,
    result_payload: null,
    error_category: null,
    error_message: null,
    approved_at: '2026-08-11T11:55:00.000Z',
    worker_id: workerId,
    claimed_at: '2026-08-11T11:59:00.000Z',
    started_at: status === 'running' ? '2026-08-11T12:00:00.000Z' : null,
    completed_at: null,
    attempt_count: 1
  };
}

class FakeClient {
  job: any;
  quote: any;

  constructor(status: string) {
    this.job = newJob(status);
    this.quote = { shipment_request: shipment, carrier_quotes: [] };
  }

  async query(sql: string, params: any[] = []): Promise<any> {
    const statement = sql.replace(/\s+/g, ' ').trim();
    if (statement.includes("SET status = 'uncertain'") && statement.includes('WORKER_HEARTBEAT_LOST')) {
      return { rows: [] };
    }
    if (statement.includes("SET status = 'pending', worker_id = NULL") && statement.includes("status = 'claimed'")) {
      return { rows: [] };
    }
    if (statement.startsWith('SELECT * FROM public.dat_rateview_jobs') &&
        statement.includes("worker_id = $1") && statement.includes("status = 'claimed'") &&
        !statement.includes('WHERE id = $1')) {
      return { rows: this.job.status === 'claimed' && this.job.worker_id === params[0] ? [this.job] : [] };
    }
    if (statement.includes('SET claimed_at = NOW()') && statement.includes("status = 'claimed'")) {
      if (this.job.id !== params[0] || this.job.worker_id !== params[1] || this.job.status !== 'claimed') {
        return { rows: [] };
      }
      this.job.claimed_at = new Date().toISOString();
      return { rows: [this.job] };
    }
    if (statement.startsWith('SELECT * FROM public.dat_rateview_jobs') &&
        statement.includes('id = $1 AND worker_id = $2')) {
      return {
        rows: this.job.id === params[0] && this.job.worker_id === params[1] ? [this.job] : []
      };
    }
    if (statement.includes("SET status = 'running', started_at = NOW()")) {
      if (this.job.status !== 'claimed') return { rows: [] };
      this.job.status = 'running';
      this.job.started_at = new Date().toISOString();
      return { rows: [this.job] };
    }
    if (statement.includes("SET status = 'completed', result_payload = $3::jsonb")) {
      if (['claimed', 'running'].indexOf(this.job.status) === -1) return { rows: [] };
      this.job.status = 'completed';
      this.job.result_payload = JSON.parse(params[2]);
      this.job.error_category = null;
      this.job.error_message = null;
      this.job.completed_at = new Date().toISOString();
      return { rows: [this.job] };
    }
    if (statement.includes('SET status = $3, error_category = $4')) {
      if (['claimed', 'running'].indexOf(this.job.status) === -1) return { rows: [] };
      this.job.status = params[2];
      this.job.error_category = params[3];
      this.job.error_message = params[4];
      this.job.completed_at = new Date().toISOString();
      return { rows: [this.job] };
    }
    if (statement.startsWith('SELECT shipment_request, carrier_quotes')) {
      return { rows: [this.quote] };
    }
    if (statement.startsWith('UPDATE public.email_quote_requests SET carrier_quotes')) {
      this.quote.carrier_quotes = JSON.parse(params[1]);
      return { rows: [this.quote] };
    }
    if (statement.startsWith('SELECT * FROM public.dat_rateview_jobs') &&
        statement.includes("WHERE status = 'pending'")) {
      return { rows: [] };
    }
    throw new Error(`Unhandled fake SQL: ${statement}`);
  }
}

async function withFakeClient(client: FakeClient, action: () => Promise<void>) {
  const original = db.transactionWithUser;
  (db as any).transactionWithUser = async function(callback: (value: FakeClient) => Promise<any>) {
    return callback(client);
  };
  try {
    await action();
  } finally {
    (db as any).transactionWithUser = original;
  }
}

async function run() {
  const claimClient = new FakeClient('claimed');
  await withFakeClient(claimClient, async function() {
    const first = await claimDatRateViewJob(workerId);
    assert(first);
    assert.strictEqual(first.id, claimClient.job.id);
    assert.strictEqual(first.attemptCount, 1, 'resuming a lost claim must not count as another attempt');
  });

  const startClient = new FakeClient('claimed');
  await withFakeClient(startClient, async function() {
    await startDatRateViewJob(startClient.job.id, workerId);
    await startDatRateViewJob(startClient.job.id, workerId);
    assert.strictEqual(startClient.job.status, 'running');
  });

  const completeClient = new FakeClient('running');
  await withFakeClient(completeClient, async function() {
    await completeDatRateViewJob(completeClient.job.id, workerId, completedResult);
    await completeDatRateViewJob(completeClient.job.id, workerId, completedResult);
    assert.strictEqual(completeClient.job.status, 'completed');
    await assert.rejects(
      completeDatRateViewJob(completeClient.job.id, workerId, {
        ...completedResult,
        lookupTimestamp: '2026-08-11T12:01:00.000Z'
      }),
      function(error: any) { return error && error.status === 409; }
    );
  });

  const failClient = new FakeClient('claimed');
  await withFakeClient(failClient, async function() {
    await failDatRateViewJob(failClient.job.id, workerId, 'needs_auth', 'AUTH_REQUIRED', 'Sign in required');
    await failDatRateViewJob(failClient.job.id, workerId, 'needs_auth', 'AUTH_REQUIRED', 'Sign in required');
    assert.strictEqual(failClient.job.status, 'needs_auth');
    await assert.rejects(
      failDatRateViewJob(failClient.job.id, workerId, 'failed', 'OTHER', 'Different failure'),
      function(error: any) { return error && error.status === 409; }
    );
  });

  console.log('DAT worker state-machine idempotency tests passed.');
}

run().finally(function() {
  db.pool.end();
});
