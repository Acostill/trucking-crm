#!/usr/bin/env node

import 'dotenv/config';
import http from 'http';
import debugFactory from 'debug';
import app from '../app';
import { startGmailQuotePoller } from '../services/emailQuotePoller';
import { assertEnvironmentSafety } from '../config/environmentSafety';
import { assertDatabaseIdentity } from '../config/databaseIdentity';

const debug = debugFactory('server:server');

const port = normalizePort(process.env.PORT || '3001');
app.set('port', port);

const server = http.createServer(app);

server.on('error', onError);
server.on('listening', onListening);

async function start() {
  const environment = assertEnvironmentSafety();
  if (environment.enforced) await assertDatabaseIdentity();
  server.listen(port);
}

start().catch(function(err) {
  console.error('[Startup]', err && err.message ? err.message : err);
  process.exit(1);
});

function normalizePort(val: string) {
  const p = parseInt(val, 10);
  if (isNaN(p)) {
    return val;
  }
  if (p >= 0) {
    return p;
  }
  return false;
}

function onError(error: any) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + (addr && (addr as any).port);
  debug('Listening on ' + bind);
  startGmailQuotePoller();
}
