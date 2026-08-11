import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import {
  claimDatRateViewJob,
  completeDatRateViewJob,
  failDatRateViewJob,
  getDatWorkerStatus,
  startDatRateViewJob
} from '../services/datRateViewJobs';

const router = express.Router();

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

router.use(function(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.DAT_WORKER_SECRET || '';
  const supplied = req.get('X-DAT-Worker-Secret') || '';
  if (!configured) {
    res.status(503).json({ error: 'DAT_WORKER_SECRET is not configured' });
    return;
  }
  if (!safeEqual(configured, supplied)) {
    res.status(401).json({ error: 'Invalid DAT worker secret' });
    return;
  }
  next();
});

function workerIdFrom(req: Request): string {
  return String(req.body && req.body.workerId || '').trim().slice(0, 120);
}

router.get('/status', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getDatWorkerStatus());
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/claim', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = workerIdFrom(req);
    if (!workerId) {
      res.status(400).json({ error: 'workerId is required' });
      return;
    }
    const job = await claimDatRateViewJob(workerId);
    if (!job) {
      res.status(204).end();
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id/start', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = workerIdFrom(req);
    if (!workerId) {
      res.status(400).json({ error: 'workerId is required' });
      return;
    }
    await startDatRateViewJob(req.params.id, workerId);
    res.json({ status: 'running' });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id/complete', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = workerIdFrom(req);
    if (!workerId || !req.body || !req.body.result) {
      res.status(400).json({ error: 'workerId and result are required' });
      return;
    }
    await completeDatRateViewJob(req.params.id, workerId, req.body.result);
    res.json({ status: 'completed' });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id/fail', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = workerIdFrom(req);
    const allowedStates = ['needs_auth', 'failed', 'uncertain'];
    const state = String(req.body && req.body.state || 'failed');
    if (!workerId || allowedStates.indexOf(state) === -1) {
      res.status(400).json({ error: 'workerId and a valid failure state are required' });
      return;
    }
    await failDatRateViewJob(
      req.params.id,
      workerId,
      state as 'needs_auth' | 'failed' | 'uncertain',
      String(req.body && req.body.category || 'UNEXPECTED_ERROR'),
      String(req.body && req.body.message || 'DAT lookup failed')
    );
    res.json({ status: state });
  } catch (err) {
    next(err);
  }
});

export default router;
