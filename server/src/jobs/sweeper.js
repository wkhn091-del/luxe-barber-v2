/**
 * The sweeper — one function, two entry points.
 *
 *   - `startScheduler()` on a persistent host (Render): setInterval, 30s.
 *   - `POST /api/internal/sweep` on serverless (Vercel Cron): same tick.
 *
 * It is a *liveness* mechanism, not a correctness one. Correctness comes from
 * `releaseExpiredHolds()`, which every read and write path calls, so an expired
 * offer is already dead to anyone looking even if this never runs. The sweeper's
 * job is to push the cascade forward without waiting for someone to load a page.
 */
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { expireDueOffers } from '../services/waitlist.service.js';
import { releaseExpiredHolds } from '../services/availability.service.js';
import { dispatchQueued, enqueue } from '../notifications/index.js';
import { addMinutes } from '../lib/time.js';
import { reminderWindows } from '../lib/reminders.js';

/** Single-flight guard: a slow tick must not stack on the next one. */
let running = false;

export async function runSweep() {
  if (running) return { skipped: true };
  running = true;
  const startedAt = Date.now();

  try {
    // 1. The Smart VIP Waitlist heartbeat: expire timed-out offers and cascade
    //    each to the next candidate.
    const offers = await expireDueOffers({ limit: 50 });

    // 2. Belt and braces — release any HELD row whose offer row vanished.
    const orphans = await releaseExpiredHolds(prisma, {});

    // 3. Reminders.
    const reminders = await queueReminders();

    // 4. Close out appointments that have simply happened.
    const completed = await autoComplete();

    // 5. Drain the notification outbox.
    const notifications = await dispatchQueued({ limit: 40 });

    const summary = {
      ...offers,
      orphanHolds: orphans,
      ...reminders,
      completed,
      notifications,
      ms: Date.now() - startedAt,
    };

    if (offers.expired || reminders.sent24 || reminders.sent1h || notifications.sent) {
      logger.info('sweep', summary);
    }
    return summary;
  } catch (err) {
    logger.error('sweep failed', { error: err.message, stack: err.stack });
    return { error: err.message };
  } finally {
    running = false;
  }
}

/**
 * The day-before and two-hour reminders. WHEN each goes out lives in
 * lib/reminders.js; this only finds the appointments inside each window.
 *
 * Claim, then send: the marker flips in the same transaction that queues the
 * email, and only the sweep that flips it (count === 1) queues anything — so
 * two overlapping sweeps can never remind the same client twice.
 */
async function queueReminders() {
  const counts = {};

  for (const { template, column, minutesBefore, after, until } of reminderWindows(new Date())) {
    const due = await prisma.appointment.findMany({
      where: { status: 'CONFIRMED', [column]: null, startAt: { gt: after, lte: until } },
      include: { client: true, barber: true, service: true },
      take: 50,
    });

    counts[template] = 0;
    for (const appointment of due) {
      // The rule, stated outright (the window above already implies it):
      // a reminder goes out only once now >= start − its lead time.
      const moment = appointment.startAt.getTime() - minutesBefore * 60_000;
      if (Date.now() < moment) continue;
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({
          where: { id: appointment.id, [column]: null },
          data: { [column]: new Date() },
        });
        if (count === 0) return; // another sweep got there first
        await enqueue(tx, {
          client: appointment.client,
          template,
          data: { barber: appointment.barber, service: appointment.service, appointment },
        });
        counts[template] += 1;
        console.log(
          `${new Date().toISOString()} [reminder] queued ${template} for appointment ${appointment.id} ` +
            `starting ${appointment.startAt.toISOString()} (${Math.round((appointment.startAt.getTime() - Date.now()) / 60_000)} min ahead)`
        );
      });
    }
  }

  return { sent24: counts.REMINDER_24H ?? 0, sent1h: counts.REMINDER_1H ?? 0 };
}

/**
 * Appointments that ended over an hour ago become COMPLETED. Keeps the agenda
 * clean and feeds the "past clients" segment that Flash Slots targets. The
 * barber can still correct one to NO_SHOW afterwards.
 */
async function autoComplete() {
  const { count } = await prisma.appointment.updateMany({
    where: { status: 'CONFIRMED', endAt: { lt: addMinutes(new Date(), -60) } },
    data: { status: 'COMPLETED' },
  });
  return count;
}

export function startScheduler() {
  if (!env.ENABLE_SCHEDULER) {
    logger.info('scheduler disabled — drive POST /api/internal/sweep with an external cron');
    return null;
  }

  logger.info('scheduler started', { intervalMs: env.SWEEP_INTERVAL_MS });
  const timer = setInterval(() => {
    runSweep().catch((err) => logger.error('sweep crashed', { error: err.message }));
  }, env.SWEEP_INTERVAL_MS);

  timer.unref?.(); // never hold the process open on its own
  return timer;
}
