import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { corsOrigins, isProd } from './config/env.js';
import { prisma } from './lib/prisma.js';
import publicRoutes from './routes/public.routes.js';
import adminAuthRoutes from './routes/adminAuth.routes.js';
import adminServicesRoutes from './routes/adminServices.routes.js';
import adminRoutes from './routes/admin.routes.js';
import internalRoutes from './routes/internal.routes.js';
import exportRoutes from './routes/export.routes.js';
import unsubscribeRoutes from './routes/unsubscribe.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import { requireAdmin } from './middleware/auth.js';
import { apiLimiter, noStore, securityHeaders } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Behind Render/Vercel's proxy: trust exactly ONE hop, so req.ip is the
  // client's address. `true` would trust any X-Forwarded-For a client
  // invents — and let anyone dodge every rate limit with a fake header.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(compression());
  // Every body this API accepts is a few hundred bytes. A small ceiling means
  // a flood of huge payloads is refused before it costs any parsing.
  app.use(express.json({ limit: '64kb' }));
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin: curl, the cron, server-to-server — CORS does not apply.
        if (!origin) return cb(null, true);
        // Development: any origin (Vite on another port, a phone on the LAN).
        if (!isProd || corsOrigins.includes(origin)) return cb(null, true);
        // A foreign origin simply gets no CORS headers, so the browser refuses
        // to hand it the response. Passing an Error here instead turned every
        // blocked preflight into a logged 500.
        return cb(null, false);
      },
      // Auth is a Bearer header, never a cookie — so credentials stay off.
      credentials: false,
      maxAge: 600, // browsers cache the preflight for ten minutes
    })
  );

  // A coarse ceiling on everything; booking and login routes are stricter.
  app.use('/api', apiLimiter);

  // Personal data never lands in a browser or proxy cache.
  app.use(['/api/admin', '/api/appointments', '/api/offers', '/api/waitlist'], noStore);

  // Readiness probe that actually touches the database.
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, ts: new Date().toISOString() });
    } catch (err) {
      // The raw driver error can name hosts and users — that stays in the logs.
      res.status(503).json({ ok: false, error: isProd ? 'database unavailable' : err.message });
    }
  });

  app.use('/api', publicRoutes);
  // Order matters: /api/admin/auth and /api/admin/services must resolve on
  // their own routers before the catch-all admin router applies its JWT guard.
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/services', requireAdmin, adminServicesRoutes);
  // Authorised by its signed link, not a session (see lib/exportLink.js).
  app.use('/api/export', exportRoutes);
  // Also authorised by what is in their own URL: a signed link, a feed token.
  app.use('/api/unsubscribe', unsubscribeRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
