import assert from 'assert';
import http from 'http';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import db from '../db';
import quotesRouter from '../routes/quotes';
import loadsRouter from '../routes/loads';

async function main() {
  const originalQuery = db.query;
  const originalQueryWithUser = db.queryWithUser;
  const originalTransaction = db.transactionWithUser;
  let quoteRow: any = null;
  let loadRow: any = null;
  let loadInserts = 0;

  (db as any).query = async function(sql: string, params: any[] = []) {
    if (sql.indexOf('FROM public.quotes WHERE id = $1') > -1) {
      return { rows: quoteRow && quoteRow.id === params[0] ? [quoteRow] : [] };
    }
    throw new Error(`Unexpected test query: ${sql}`);
  };

  (db as any).queryWithUser = async function(sql: string, params: any[] = []) {
    if (sql.indexOf('INSERT INTO public.quotes') === -1) {
      throw new Error(`Unexpected test queryWithUser: ${sql}`);
    }
    quoteRow = {
      id: params[0],
      status: params[1],
      contact_name: params[2],
      contact_email: params[3],
      contact_phone: params[4],
      quote_total: params[5],
      quote_linehaul: params[6],
      quote_rate_per_mile: params[7],
      quote_truck_type: params[8],
      quote_transit_time: params[9],
      quote_rate_calculation_id: params[10],
      quote_accessorials: params[11],
      quote_accessorials_total: params[12],
      shipment_data: params[13],
      submitted_at: params[14],
      quote_url: params[15],
      n8n_webhook_sent: params[16],
      public_access_token_hash: params[17],
      created_by: params[18],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return { rows: [quoteRow] };
  };

  (db as any).transactionWithUser = async function(callback: (client: any) => Promise<any>) {
    return callback({
      query: async function(sql: string, params: any[] = []) {
        if (sql.indexOf('SELECT * FROM public.quotes') > -1 && sql.indexOf('FOR UPDATE') > -1) {
          return { rows: quoteRow && quoteRow.id === params[0] ? [quoteRow] : [] };
        }
        if (sql.indexOf('SELECT * FROM public.loads WHERE source_quote_id') > -1) {
          return { rows: loadRow ? [loadRow] : [] };
        }
        if (sql.indexOf('INSERT INTO public.loads') > -1) {
          loadInserts += 1;
          loadRow = {
            id: 101,
            source_quote_id: params[0],
            customer: params[1],
            load_number: params[2],
            status: params[6]
          };
          return { rows: [loadRow] };
        }
        if (sql.indexOf('UPDATE public.quotes') > -1) {
          quoteRow = {
            ...quoteRow,
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: params[1]
          };
          return { rows: [quoteRow] };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }
    });
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/quotes', quotesRouter);
  app.use('/api/loads', loadsRouter);
  app.use(function(err: any, _req: Request, res: Response, _next: NextFunction) {
    res.status(err.status || 500).json({ error: err.message });
  });

  const server = http.createServer(app);
  try {
    await new Promise<void>(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const createResponse = await fetch(`${base}/api/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'attacker-chosen-id',
        status: 'approved',
        contact: { name: 'Test Customer', email: 'customer@example.com' },
        quote: { total: 725, truckType: 'Cargo Van' },
        shipment: {
          pickup: { location: { city: 'Miami', state: 'FL', zip: '33101' } },
          delivery: { location: { city: 'Orlando', state: 'FL', zip: '32801' } }
        }
      })
    });
    assert.equal(createResponse.status, 201);
    const created: any = await createResponse.json();
    assert.notEqual(created.id, 'attacker-chosen-id');
    assert.equal(created.status, 'pending');
    assert.equal(typeof created.publicAccessToken, 'string');
    assert(created.publicAccessToken.length >= 40);
    assert.equal(quoteRow.public_access_token_hash.includes(created.publicAccessToken), false);

    const noToken = await fetch(`${base}/api/quotes/${created.id}`);
    assert.equal(noToken.status, 401);

    const tokenHeaders = { 'X-Quote-Access-Token': created.publicAccessToken };
    const allowed = await fetch(`${base}/api/quotes/${created.id}`, { headers: tokenHeaders });
    assert.equal(allowed.status, 200);

    const firstApproval = await fetch(`${base}/api/quotes/${created.id}/approve`, {
      method: 'POST',
      headers: tokenHeaders
    });
    assert.equal(firstApproval.status, 200);
    const firstApprovalBody: any = await firstApproval.json();
    assert.equal(firstApprovalBody.load.id, 101);

    const repeatedApproval = await fetch(`${base}/api/quotes/${created.id}/approve`, {
      method: 'POST',
      headers: tokenHeaders
    });
    assert.equal(repeatedApproval.status, 200);
    const repeatedApprovalBody: any = await repeatedApproval.json();
    assert.equal(repeatedApprovalBody.load.id, 101);
    assert.equal(loadInserts, 1);

    const unauthenticatedQuoteList = await fetch(`${base}/api/quotes`);
    assert.equal(unauthenticatedQuoteList.status, 401);
    const unauthenticatedLoads = await fetch(`${base}/api/loads`);
    assert.equal(unauthenticatedLoads.status, 401);

    console.log('Phase 1 quote route access and idempotency checks passed.');
  } finally {
    (db as any).query = originalQuery;
    (db as any).queryWithUser = originalQueryWithUser;
    (db as any).transactionWithUser = originalTransaction;
    if (server.listening) {
      await new Promise<void>(function(resolve, reject) {
        server.close(function(err) { if (err) reject(err); else resolve(); });
      });
    }
    await db.pool.end();
  }
}

main().catch(function(err) {
  console.error(err);
  process.exitCode = 1;
});
