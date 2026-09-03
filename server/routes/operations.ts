import express, { NextFunction, Request, Response } from 'express';
import { requireAnyRole } from '../utils/auth';
import { getOperationsHealth } from '../services/operationsHealth';

const router = express.Router();

router.use(requireAnyRole(['admin', 'manager', 'agent', 'viewer', 'quote_approver']));

router.get('/health', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getOperationsHealth());
  } catch (err) {
    next(err);
  }
});

export default router;
