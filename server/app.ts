import createError from 'http-errors';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import loadsRouter from './routes/loads';
import authRouter from './routes/auth';
import quotesRouter from './routes/quotes';
import adminRouter from './routes/admin';

const app = express();
const ROOT_DIR = __dirname;

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value || typeof value !== 'string') {
    return ['http://localhost:3000'];
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

app.use('/', indexRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/loads', loadsRouter);
app.use('/api/auth', authRouter);
app.use('/api/quotes', quotesRouter);

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

