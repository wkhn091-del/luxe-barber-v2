import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

/**
 * Single client, reused across hot reloads in dev so we don't leak connections.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.__prisma = prisma;

/**
 * Postgres transaction-scoped advisory lock.
 *
 * Serialises every operation touching one (barber, slot) pair across all
 * processes — the cascade, a public booking and an admin edit cannot interleave.
 * Released automatically on COMMIT or ROLLBACK, so there is nothing to leak.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} barberId
 * @param {Date} slotStart
 */
export async function lockSlot(tx, barberId, slotStart) {
  const key = `${barberId}:${slotStart.toISOString()}`;
  // hashtext() → int4; the first argument namespaces this lock class so it can
  // never collide with another advisory lock in the app.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${key}))`;
}
