/**
 * Dynamic scheduling — what the barber's phone actually talks to.
 *
 * The interesting behaviour: opening an extra window does not merely insert a
 * row. It works out which slots that window just created and runs the waitlist
 * engine against each of them. Tapping "open 14:00–16:00 Thursday" can fire four
 * WhatsApp offers before the barber puts the phone down.
 */
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { enqueue, reachableClientWhere } from '../notifications/index.js';
import { getAvailability } from './availability.service.js';
import { offerSlotToNextCandidate } from './waitlist.service.js';
import { env } from '../config/env.js';
import { addMinutes } from '../lib/time.js';

// ---------------------------------------------------------------------------
// Weekly template
// ---------------------------------------------------------------------------

export async function getWorkingHours(barberId) {
  return prisma.workingHoursRule.findMany({
    where: { barberId },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });
}

/**
 * Replace the whole weekly template in one transaction.
 *
 * Wholesale replacement rather than per-row edits: the admin UI edits a week as
 * a single object, and this keeps "what the barber sees" and "what is stored"
 * from drifting apart on a flaky mobile connection.
 */
export async function replaceWorkingHours(barberId, rules) {
  for (const r of rules) {
    if (r.weekday < 1 || r.weekday > 7) throw badRequest('weekday must be 1 (Mon) to 7 (Sun)');
    if (r.startMinute >= r.endMinute) throw badRequest('startMinute must be before endMinute');
    if (r.endMinute > 24 * 60) throw badRequest('endMinute must be within the day');
  }

  // Overlapping rules for the same weekday would double-count availability.
  const byDay = new Map();
  for (const r of rules) {
    const list = byDay.get(r.weekday) ?? [];
    list.push(r);
    byDay.set(r.weekday, list);
  }
  for (const [weekday, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        throw badRequest(`Overlapping working hours on weekday ${weekday}`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.workingHoursRule.deleteMany({ where: { barberId } });
    await tx.workingHoursRule.createMany({
      data: rules.map((r) => ({
        barberId,
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        active: r.active ?? true,
      })),
    });
    return tx.workingHoursRule.findMany({
      where: { barberId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
  });
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export async function listExceptions({ barberId, from, to }) {
  return prisma.scheduleException.findMany({
    where: { barberId, startAt: { lt: to }, endAt: { gt: from } },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Open an extra window, then immediately offer the slots it created.
 *
 * @returns {Promise<{exception, offersSent:number, slotsCreated:number}>}
 */
export async function openExtraWindow({ barberId, startAt, endAt, note, createdBy, serviceId }) {
  if (startAt >= endAt) throw badRequest('startAt must be before endAt');

  const exception = await prisma.scheduleException.create({
    data: { barberId, kind: 'OPEN', startAt, endAt, note, createdBy },
  });

  // Ask the availability engine what is genuinely bookable now — rather than
  // assuming the whole window is free, since a BLOCK or an existing booking may
  // already overlap it.
  const targetService =
    serviceId ??
    (
      await prisma.service.findFirst({
        where: { barberId, active: true },
        orderBy: { durationMin: 'asc' },
      })
    )?.id;

  if (!targetService) return { exception, offersSent: 0, slotsCreated: 0 };

  const { slots } = await getAvailability({
    barberId,
    serviceId: targetService,
    from: startAt,
    to: endAt,
  });

  // Offer sequentially, not in parallel: each offer places a HELD row, and the
  // next iteration must see it. Parallel calls would all read the same empty
  // window and collide on the exclusion constraint.
  let offersSent = 0;
  for (const slot of slots) {
    const res = await offerSlotToNextCandidate({
      barberId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      serviceId: targetService,
      reason: 'hours_opened',
    });
    if (res.status === 'offered') offersSent += 1;
    if (res.status === 'no_candidate') break; // queue exhausted — stop scanning
  }

  logger.info('extra window opened', {
    barberId,
    slotsCreated: slots.length,
    offersSent,
  });

  return { exception, offersSent, slotsCreated: slots.length };
}

/**
 * Block time off (break, errand, holiday).
 *
 * Existing bookings inside the blocked range are NOT auto-cancelled — that is a
 * relationship decision, not a database one. They are returned so the dashboard
 * can show "3 appointments are inside this block" and let the barber choose.
 */
export async function blockTime({ barberId, startAt, endAt, note, createdBy, force = false }) {
  if (startAt >= endAt) throw badRequest('startAt must be before endAt');

  const conflicts = await prisma.appointment.findMany({
    where: {
      barberId,
      status: { in: ['HELD', 'PENDING', 'CONFIRMED'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: {
      client: { select: { name: true, phone: true } },
      service: { select: { name: true } },
    },
  });

  if (conflicts.length && !force) {
    throw conflict(
      'HAS_APPOINTMENTS',
      `${conflicts.length} appointment(s) fall inside that block. Move or cancel them, or resend with force=true.`
    );
  }

  const exception = await prisma.scheduleException.create({
    data: { barberId, kind: 'BLOCK', startAt, endAt, note, createdBy },
  });

  return { exception, conflicts };
}

/** Removing a BLOCK frees time, so it runs the same refill pass as opening one. */
export async function removeException({ barberId, id }) {
  const exception = await prisma.scheduleException.findFirst({ where: { id, barberId } });
  if (!exception) throw notFound('Exception not found');

  await prisma.scheduleException.delete({ where: { id } });

  if (exception.kind === 'BLOCK' && exception.endAt > new Date()) {
    const service = await prisma.service.findFirst({
      where: { barberId, active: true },
      orderBy: { durationMin: 'asc' },
    });
    if (service) {
      const { slots } = await getAvailability({
        barberId,
        serviceId: service.id,
        from: exception.startAt,
        to: exception.endAt,
      });
      for (const slot of slots) {
        const res = await offerSlotToNextCandidate({
          barberId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          serviceId: service.id,
          reason: 'block_removed',
        });
        if (res.status === 'no_candidate') break;
      }
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Flash slots
// ---------------------------------------------------------------------------

/**
 * Broadcast a last-minute gap to past clients. First to book wins.
 *
 * Deliberately NOT the waitlist mechanism: nothing is held, and the race is the
 * point. The waitlist is for people who asked to be queued; Flash is a
 * best-effort blast to fill a hole in the next couple of hours.
 *
 * Guarded by consent, a recipient cap and a per-client cooldown — the fastest
 * way to destroy this feature's value is to send it twice a day to everyone.
 */
export async function broadcastFlashSlot({ barberId, startAt, endAt, message, createdBy }) {
  const barber = await prisma.barber.findUniqueOrThrow({ where: { id: barberId } });

  const clash = await prisma.appointment.findFirst({
    where: {
      barberId,
      status: { in: ['HELD', 'PENDING', 'CONFIRMED'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (clash) throw conflict('SLOT_TAKEN', 'That slot is not actually free.');

  const cooldownSince = new Date(Date.now() - env.FLASH_COOLDOWN_HOURS * 3600_000);

  const recipients = await prisma.client.findMany({
    where: {
      marketingOptIn: true,
      // Only people an automated channel can reach, so recipientCount is the
      // number of messages that will really go out.
      ...reachableClientWhere(),
      appointments: { some: { barberId, status: 'COMPLETED' } },
      // Cooldown: skip anyone who already got a flash recently.
      notifications: {
        none: { template: 'FLASH_SLOT', createdAt: { gte: cooldownSince } },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: env.FLASH_MAX_RECIPIENTS,
  });

  const broadcast = await prisma.$transaction(async (tx) => {
    const row = await tx.flashBroadcast.create({
      data: {
        barberId,
        slotStartAt: startAt,
        slotEndAt: endAt,
        message,
        createdBy,
        recipientCount: recipients.length,
      },
    });

    for (const client of recipients) {
      await enqueue(tx, {
        client,
        template: 'FLASH_SLOT',
        data: { barber, broadcast: row },
      });
    }
    return row;
  });

  logger.info('flash slot broadcast', { barberId, recipients: recipients.length });
  return { broadcast, recipientCount: recipients.length };
}

/** Suggest today's genuinely empty slots, so the Flash button is one tap. */
export async function suggestFlashSlots({ barberId, hoursAhead = 8 }) {
  const service = await prisma.service.findFirst({
    where: { barberId, active: true },
    orderBy: { durationMin: 'asc' },
  });
  if (!service) return [];

  const now = new Date();
  const { slots } = await getAvailability({
    barberId,
    serviceId: service.id,
    from: now,
    to: addMinutes(now, hoursAhead * 60),
  });
  return slots.slice(0, 12);
}
