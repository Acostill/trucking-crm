import express, { NextFunction, Request, Response } from 'express';
import { requireAnyRole } from '../utils/auth';
import { getOperationsHealth } from '../services/operationsHealth';
import db from '../db';

const router = express.Router();

router.use(requireAnyRole(['admin', 'manager', 'agent', 'viewer', 'quote_approver']));

router.get('/health', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getOperationsHealth());
  } catch (err) {
    next(err);
  }
});

router.get('/customer-performance', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedRange = String(req.query.range || '90').toLowerCase();
    const rangeDays: Record<string, number | null> = {
      '30': 30,
      '90': 90,
      '365': 365,
      all: null
    };
    const range = Object.prototype.hasOwnProperty.call(rangeDays, requestedRange)
      ? requestedRange
      : '90';
    const days = rangeDays[range];
    const since = days == null
      ? null
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.query(
      `SELECT
         COALESCE(NULLIF(LOWER(quote_sent_to), ''), NULLIF(LOWER(sender_email), ''), 'unknown') AS customer_email,
         MAX(COALESCE(sender_name, quote_sent_to, sender_email, 'Unknown customer')) AS customer_name,
         COUNT(*)::int AS requests,
         COUNT(*) FILTER (WHERE quote_sent_at IS NOT NULL)::int AS sent,
         COUNT(*) FILTER (WHERE quote_outcome = 'awarded')::int AS awarded,
         COUNT(*) FILTER (WHERE quote_outcome = 'lost')::int AS lost,
         COUNT(*) FILTER (WHERE quote_sent_at IS NOT NULL AND quote_outcome = 'open')::int AS open,
         COALESCE(SUM(client_price) FILTER (WHERE quote_sent_at IS NOT NULL), 0)::numeric AS quoted_value,
         COALESCE(SUM(client_price) FILTER (WHERE quote_outcome = 'awarded'), 0)::numeric AS awarded_value,
         COALESCE(SUM(client_price) FILTER (WHERE quote_outcome = 'lost'), 0)::numeric AS lost_value,
         COALESCE(SUM(client_price - selected_carrier_cost)
           FILTER (
             WHERE quote_outcome = 'awarded'
               AND client_price IS NOT NULL
               AND selected_carrier_cost IS NOT NULL
           ), 0)::numeric AS awarded_gross_profit,
         COUNT(*) FILTER (
           WHERE follow_up_status = 'due'
             AND follow_up_at IS NOT NULL
             AND follow_up_at <= NOW()
         )::int AS follow_ups_due,
         MAX(quote_sent_at) AS last_quote_sent_at,
         MAX(COALESCE(outcome_at, quote_sent_at, received_at, created_at)) AS last_activity_at
       FROM public.email_quote_requests
       WHERE archived_at IS NULL
         AND quote_sent_at IS NOT NULL
         AND ($1::timestamptz IS NULL OR COALESCE(outcome_at, quote_sent_at, received_at, created_at) >= $1::timestamptz)
       GROUP BY COALESCE(NULLIF(LOWER(quote_sent_to), ''), NULLIF(LOWER(sender_email), ''), 'unknown')
       ORDER BY sent DESC, requests DESC
       LIMIT 100`,
      [since]
    );
    const customers = result.rows.map(function(row) {
      const sent = Number(row.sent) || 0;
      const awarded = Number(row.awarded) || 0;
      const lost = Number(row.lost) || 0;
      const decided = awarded + lost;
      return {
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        requests: Number(row.requests) || 0,
        sent,
        awarded,
        lost,
        open: Number(row.open) || 0,
        followUpsDue: Number(row.follow_ups_due) || 0,
        winRatePct: decided ? Number(((awarded / decided) * 100).toFixed(1)) : 0,
        quotedValue: Number(row.quoted_value) || 0,
        awardedValue: Number(row.awarded_value) || 0,
        lostValue: Number(row.lost_value) || 0,
        awardedGrossProfit: Number(row.awarded_gross_profit) || 0,
        averageSentQuote: sent ? Number(((Number(row.quoted_value) || 0) / sent).toFixed(2)) : 0,
        lastQuoteSentAt: row.last_quote_sent_at,
        lastActivityAt: row.last_activity_at
      };
    });
    const summary = customers.reduce(function(acc, customer) {
      acc.requests += customer.requests;
      acc.sent += customer.sent;
      acc.awarded += customer.awarded;
      acc.lost += customer.lost;
      acc.open += customer.open;
      acc.followUpsDue += customer.followUpsDue;
      acc.quotedValue += customer.quotedValue;
      acc.awardedValue += customer.awardedValue;
      acc.lostValue += customer.lostValue;
      acc.awardedGrossProfit += customer.awardedGrossProfit;
      return acc;
    }, {
      requests: 0,
      sent: 0,
      awarded: 0,
      lost: 0,
      open: 0,
      followUpsDue: 0,
      quotedValue: 0,
      awardedValue: 0,
      lostValue: 0,
      awardedGrossProfit: 0,
      winRatePct: 0
    });
    const decided = summary.awarded + summary.lost;
    summary.winRatePct = decided ? Number(((summary.awarded / decided) * 100).toFixed(1)) : 0;
    res.json({
      range,
      since,
      generatedAt: new Date().toISOString(),
      summary,
      customers
    });
  } catch (err) {
    next(err);
  }
});

export default router;
