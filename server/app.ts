import createError from 'http-errors';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import loadsRouter from './routes/loads';
import authRouter from './routes/auth';
import quotesRouter from './routes/quotes';
import adminRouter from './routes/admin';
import ocrRouter from './routes/ocr';
import openaiDimensionsRouter from './routes/openaiDimensions';
import openrouterDimensionsRouter from './routes/openrouterDimensions';

const app = express();
// In dev (ts-node-dev) this file runs in place, so __dirname is server/.
// Compiled, it runs from server/dist/app.js, so __dirname is server/dist —
// one level deeper. Resolve the actual server/ package directory in both
// cases so on-disk paths (views/, public/, and the sibling ../landing,
// ../client builds) are correct whether run from source or dist.
const ROOT_DIR = path.basename(__dirname) === 'dist' ? path.join(__dirname, '..') : __dirname;

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value || typeof value !== 'string') {
    return ['http://localhost:3000', 'http://localhost:5173'];
  }
  return value
    .split(',')
    .map(function(entry) { return entry.trim(); })
    .filter(Boolean);
}

const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
const allowAllOrigins = allowedOrigins.indexOf('*') > -1;
const corsOptions = {
  origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin || allowAllOrigins || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// view engine setup
app.set('views', path.join(ROOT_DIR, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(ROOT_DIR, 'public')));

// Self-hosted single-port mode: the public landing page (landing/dist) owns
// "/" and its own asset paths, the Lanely CRM (client/build) owns everything
// else non-API (/loads, /pipeline, /dashboard, ...). Both are optional here —
// if a build hasn't been generated yet, express.static simply serves
// nothing from that directory and falls through, so this is a no-op in
// pure-API dev setups.
const LANDING_DIST = path.join(ROOT_DIR, '..', 'landing', 'dist');
const CLIENT_BUILD = path.join(ROOT_DIR, '..', 'client', 'build');
app.use(express.static(LANDING_DIST));
app.use(express.static(CLIENT_BUILD));

app.use('/', indexRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/loads', loadsRouter);
app.use('/api/auth', authRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/extract-dimensions', openaiDimensionsRouter);
app.use('/api/extract-dimensions-openrouter', openrouterDimensionsRouter);

// SPA fallback for the CRM: any GET request that isn't an API call and
// doesn't match a static file above (e.g. /loads, /login, /pipeline) is
// handled client-side by client/build's React Router, so serve its
// index.html rather than 404ing.
const CLIENT_INDEX = path.join(CLIENT_BUILD, 'index.html');
app.get('*', function(req: Request, res: Response, next: NextFunction) {
  const isApiPath =
    req.path.startsWith('/api/') ||
    req.path === '/calculate-rate' ||
    req.path === '/forwardair-quote';
  const looksLikeFile = path.extname(req.path) !== '';
  if (isApiPath || looksLikeFile || !fs.existsSync(CLIENT_INDEX)) {
    next();
    return;
  }
  res.sendFile(CLIENT_INDEX);
});

// catch 404 and forward to error handler
app.use(function(_req: Request, _res: Response, next: NextFunction) {
  next(createError(404));
});

// error handler
app.use(function(err: any, req: Request, res: Response, _next: NextFunction) {
  // For API routes, return JSON instead of rendering a view
  if (req.path.startsWith('/api/')) {
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      ...(req.app.get('env') === 'development' ? { stack: err.stack, details: err } : {})
    });
    return;
  }

  // For non-API routes, render the error view
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

export default app;
