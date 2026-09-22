/**
 * ===========================================================================
 *  SECURITY — headers, rate limits, and the small hardening an API needs
 * ===========================================================================
 *
 * Every protection in one file, so a reviewer sees all of it at once and the
 * routes import named limiters instead of each inventing its own numbers.
 *
 * Limits are keyed on the CLIENT's IP — true only because app.js sets
 * `trust proxy`. Behind Render or Vercel every request arrives from the proxy,
 * and without that setting the whole country would share one bucket.
 *
 * The store is in-memory: exact on a single server (Render), approximate on
 * serverless, where each warm instance counts on its own. Nothing here is the
 * last line of defence — the per-device PIN lockout (auth.service.js) and the
 * database's own slot constraint hold regardless.
 *
 * Messages are Hebrew because they reach people: the booking sheet shows a
 * server message as-is when it has no wording of its own for the code.
 */
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../lib/logger.js';

const MINUTE = 60_000;

function limiter({ name, windowMs, limit, message, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    // RateLimit + RateLimit-Policy headers: a client can see when to retry.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res, _next, opts) {
      // Logged, so a spike is visible in the logs before the barber sees it.
      logger.warn('rate limit', { limiter: name, ip: req.ip, method: req.method, path: req.baseUrl + req.path });
      res.status(opts.statusCode).json({ error: { code: 'RATE_LIMITED', message } });
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Helmet, tuned for a JSON-only API. Nothing this server returns is ever
 * rendered as a page, so its content policy is the strictest there is: no
 * sources, no framing, no forms. Helmet's other defaults stay on — HSTS,
 * nosniff, no X-Powered-By, a strict referrer policy.
 *
 * The WEBSITE's headers come from wherever the client is hosted — see
 * client/vercel.json.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
});

/**
 * Responses carrying personal data — the admin, and the token links a client
 * opens (their booking, their offer, their waitlist place) — are never kept
 * by a browser or a shared proxy cache.
 */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/**
 * Every /api request: a coarse ceiling against floods. Generous on purpose —
 * the booking sheet reads availability as people flip between days.
 */
export const apiLimiter = limiter({
  name: 'api',
  windowMs: MINUTE,
  limit: 120,
  message: 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד דקה.',
});

/** Booking, joining the waitlist, answering an offer, cancelling — per IP. */
export const bookingIpLimiter = limiter({
  name: 'booking-ip',
  windowMs: 15 * MINUTE,
  limit: 20,
  message: 'היו יותר מדי ניסיונות מהמכשיר הזה. נסו שוב בעוד רבע שעה.',
});

const phoneDigits = (req) => String(req.body?.client?.phone ?? '').replace(/\D/g, '');

/**
 * The same actions, per PHONE NUMBER. A script can rotate IP addresses far
 * more cheaply than phone numbers, and a calendar filled with fake bookings is
 * the real attack on a one-chair shop. The key is the last nine digits, so
 * 050-123-4567, 972501234567 and +972 50 123 4567 are one number.
 */
export const bookingPhoneLimiter = limiter({
  name: 'booking-phone',
  windowMs: 60 * MINUTE,
  limit: 6,
  message: 'היו יותר מדי ניסיונות עם המספר הזה. נסו שוב בעוד שעה, או התקשרו אלינו.',
  keyGenerator: (req) => `phone:${phoneDigits(req).slice(-9)}`,
  // No usable phone: validation rejects the request anyway, and every
  // malformed body must not share (and exhaust) one empty bucket.
  skip: (req) => phoneDigits(req).length < 7,
});

/** Admin email + password. Only FAILURES count, so using the app never locks the barber out. */
export const loginLimiter = limiter({
  name: 'admin-login',
  windowMs: 15 * MINUTE,
  limit: 5,
  skipSuccessfulRequests: true,
  message: 'יותר מדי ניסיונות כניסה. נסו שוב בעוד רבע שעה.',
});

/**
 * PIN unlock. The real defence is per device, in auth.service.js — a guess
 * only counts with a stolen device secret attached. This caps how fast any
 * one address can knock at all.
 */
export const pinLimiter = limiter({
  name: 'admin-pin',
  windowMs: 5 * MINUTE,
  limit: 20,
  skipSuccessfulRequests: true,
  message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
});
