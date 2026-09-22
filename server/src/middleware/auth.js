import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export async function login({ email, password }) {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { barber: { select: { id: true, name: true, slug: true, timezone: true } } },
  });

  // Same failure for "no such user" and "wrong password" — do not leak which
  // admin emails exist.
  if (!user || !user.active) throw unauthorized('Invalid credentials');
  if (!(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid credentials');

  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign(
    { sub: user.id, barberId: user.barberId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return { token, barber: user.barber, role: user.role };
}

/** Bearer-token guard. Populates req.auth = { userId, barberId, role }. */
export function requireAdmin(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());

  try {
    // Pinned algorithm: a token can never talk the server into a weaker one.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    req.auth = { userId: payload.sub, barberId: payload.barberId, role: payload.role };
    return next();
  } catch {
    return next(unauthorized('Session expired'));
  }
}

/**
 * Shared-secret guard for the cron endpoint. The secret is accepted two ways:
 *
 *   Authorization: Bearer <CRON_SECRET>   what Vercel Cron sends by itself
 *   x-cron-secret: <CRON_SECRET>          for any other scheduler, or curl
 */
export function requireCronSecret(req, _res, next) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  const provided = bearer ?? req.headers['x-cron-secret'];
  if (!provided || !sameSecret(String(provided), env.CRON_SECRET)) {
    return next(forbidden('Invalid cron secret'));
  }
  return next();
}

/** Constant-time comparison, so response timing never leaks how much matched. */
function sameSecret(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // Length first: timingSafeEqual throws on buffers of different length.
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
