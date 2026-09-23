import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { ApiError, sendApiError } from './lib/apiError.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import capsulesRouter from './routes/capsules.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render terminates TLS at its proxy.
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '256kb', strict: true }));

  // Body parser failures use the same JSON envelope as the rest of the API,
  // so a malformed request never returns an HTML error page.
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return sendApiError(res, new ApiError(400, 'MALFORMED_JSON', 'Request body is not valid JSON.'));
    }
    if (err?.type === 'entity.too.large') {
      return sendApiError(
        res,
        new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 256 kB limit.'),
      );
    }
    return next(err);
  });

  app.use(healthRouter);
  app.use(authRouter);
  app.use(capsulesRouter);

  // Unmatched API paths answer with JSON, never the SPA shell. Case-insensitive
  // so a mistyped /API/... does not return an HTML page instead of an error.
  app.use((req, res, next) => {
    const lower = req.path.toLowerCase();
    if (lower !== '/api' && !lower.startsWith('/api/')) return next();
    return sendApiError(
      res,
      new ApiError(404, 'NOT_FOUND', `No API route matches ${req.method} ${req.path}.`),
    );
  });

  const indexHtml = path.join(config.clientDist, 'index.html');

  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders(res, filePath) {
          // Vite fingerprints asset filenames, so they can be cached hard.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );

    // React Router owns /, /login and /dashboard.
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('*', (req, res) => {
      res
        .status(503)
        .type('text/plain')
        .send('The React build is missing. Run "npm run build" first.');
    });
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (!(err instanceof ApiError)) console.error('[error]', err);
    return sendApiError(res, err);
  });

  return app;
}
