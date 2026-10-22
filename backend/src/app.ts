import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import cloudRoutes from './routes/cloudRoutes';
import resourceRoutes from './routes/resourceRoutes';
import costRoutes from './routes/costRoutes';
import { alertRouter, alertRuleRouter } from './routes/alertRoutes';
import { dashboardRouter, monitoringRouter, serviceHealthRouter } from './routes/dashboardRoutes';
import { healthRouter, notificationRouter, reportRouter, searchRouter, systemRouter, userRouter } from './routes/systemRoutes';
import { errorHandler, notFound } from './middleware/errorMiddleware';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / server-to-server requests (no Origin header) and configured origins.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Basic request logging.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path === '/api/health') return;
      logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, slow down.' },
    }),
  );

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/service-health', serviceHealthRouter);
  app.use('/api/cloud-accounts', cloudRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/alerts', alertRouter);
  app.use('/api/alert-rules', alertRuleRouter);
  app.use('/api/costs', costRoutes);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/users', userRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/system', systemRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
