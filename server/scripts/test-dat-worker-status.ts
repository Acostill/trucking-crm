import assert from 'assert';
import db from '../db';
import { getDatWorkerStatus } from '../services/datRateViewJobs';

async function run() {
  const originalQuery = db.query;
  const saved = { ...process.env };
  process.env.DAT_WORKER_ENABLED = 'true';
  process.env.DAT_WORKER_SECRET = 'test-only';
  process.env.DAT_WORKER_STALE_MS = '90000';
  const now = Date.now();
  const date = (offset: number) => new Date(now + offset).toISOString();
  let heartbeat: any = {
    worker_id: 'current-worker', last_seen_at: date(0),
    last_successful_poll_at: date(0), last_job_at: date(0),
    active_job_id: null, last_error_category: null,
    last_auth_failure_at: date(-60000), last_worker_completed_at: date(-30000)
  };
  let active = 0;
  (db as any).query = async (sql: string) => {
    if (sql.includes('FROM public.dat_worker_heartbeats')) {
      // The status query must derive evidence from the selected worker, and
      // must not treat delivery of an older cached result as a new sign-in.
      assert.strictEqual((sql.match(/worker_id = heartbeat.worker_id/g) || []).length, 2);
      assert(sql.includes('MAX(LEAST(completed_at,'));
      assert(sql.includes("result_payload->>'lookupTimestamp'"));
      assert(sql.includes("result_payload->>'searchTimestamp'"));
      return { rows: heartbeat ? [heartbeat] : [] };
    }
    return { rows: [{ pending: 2, active, needs_auth: 7, failed: 0,
      uncertain: 1, last_completed_at: date(-1000) }] };
  };
  try {
    let result = await getDatWorkerStatus();
    assert.strictEqual(result.state, 'online', 'historical failures do not override later actual lookup');
    assert.strictEqual(result.needsAuth, 7, 'historical count remains available for job diagnostics');
    heartbeat.last_error_category = 'AUTH_REQUIRED';
    assert.strictEqual((await getDatWorkerStatus()).state, 'needs_auth', 'latest auth error remains visible');
    heartbeat.last_seen_at = date(-180000);
    assert.strictEqual((await getDatWorkerStatus()).state, 'offline', 'stale worker takes priority over auth');
    heartbeat.last_seen_at = date(0);
    heartbeat.last_error_category = null;
    heartbeat.last_worker_completed_at = date(-90000);
    heartbeat.active_job_id = 'new-job';
    active = 1;
    assert.strictEqual((await getDatWorkerStatus()).state, 'needs_auth', 'starting/polling cannot prove authentication');
    heartbeat.last_auth_failure_at = null;
    heartbeat.last_worker_completed_at = null;
    assert.strictEqual((await getDatWorkerStatus()).state, 'working', 'other workers historical failures do not block current worker');
    heartbeat = null;
    assert.strictEqual((await getDatWorkerStatus()).state, 'offline');
    process.env.DAT_WORKER_SECRET = '';
    assert.strictEqual((await getDatWorkerStatus()).state, 'misconfigured');
    process.env.DAT_WORKER_ENABLED = 'false';
    assert.strictEqual((await getDatWorkerStatus()).state, 'disabled');
    console.log('DAT worker status regression tests passed.');
  } finally {
    (db as any).query = originalQuery;
    for (const key of ['DAT_WORKER_ENABLED', 'DAT_WORKER_SECRET', 'DAT_WORKER_STALE_MS']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.pool.end());
