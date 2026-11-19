import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFoundApi } from './middleware/error.js';
import { adminRouter } from './routes/admin.js';
import { demoRouter } from './routes/demo.js';
import { webhookRouter } from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway/Nginx so rate limits see the real client IP

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // demo images are loaded by the frontend origin
      contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:', config.PUBLIC_BASE_URL], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'", ...config.corsOrigins.filter(Boolean)] } },
    }),
  );
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: false }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' }, serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ statusCode: r.statusCode }) } }));

  // Webhook first: it needs the RAW body for signature verification.
  app.use('/api/webhooks/whatsapp', webhookRouter);

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    const dbOk = mongoose.connection.readyState === 1;
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk ? 'connected' : 'disconnected', whatsappConfigured: config.whatsappConfigured, ocr: config.OCR_PROVIDER, time: new Date().toISOString() });
  });

  app.use('/api/demo', demoRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', notFoundApi);

  // Static demo assets (kit / assembly placeholders + sample plates)
  app.use('/demo/plates', express.static(path.resolve(process.cwd(), 'fixtures/plates'), { maxAge: '1h' }));
  app.use('/demo', express.static(path.resolve(process.cwd(), 'public/demo'), { maxAge: '1h' }));

  // Optionally serve the built React app from the same service (single-service deploy)
  const dist = path.resolve(process.cwd(), '../frontend/dist');
  if (config.SERVE_FRONTEND && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/demo')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
