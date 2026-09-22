/**
 * Availability engine.
 *
 * Pipeline:
 *   weekly template → + OPEN exceptions → − BLOCK exceptions → − busy
 *   → slice into slots → filter by lead time
 *
 * One rule governs the whole file: a slot is bookable only if it survives every
 * stage. Nothing downstream re-derives availability, so there is exactly one
 * definition of "free" in the system.
 */
import { prisma } from '../lib/prisma.js';
import { notFound, badRequest } from '../lib/errors.js';
import {
  localMinutesToUtc,
  eachLocalDate,
  mergeIntervals,
  subtractIntervals,
  ceilToGranularity,
  addMinutes,
  localDateKey,
} from '../lib/time.js';

/** Statuses that reserve a slot. Mirrors the SQL exclusion constraint predicate. */
export const BLOCKING_STATUSES = ['HELD', 'PENDING', 'CONFIRMED'];

/**
 * Flip stale HELD appointments to OFFER_EXPIRED *before* reading or writing a
 * slot ("lazy expiry").
 *
 * This is why correctness does not depend on the sweeper running on time: an
 * offer whose deadline has passed is already dead to every reader, even if no
 * background job has touched it yet. The sweeper's only job is to push the
 * cascade *forward*, not to keep the data honest.
 *
 * @param {object} tx        Prisma client or transaction client
 * @param {object} scope     { barberId, from?, to? } — narrow when possible
 */
export async function releaseExpiredHolds(tx, { barberId, from, to } = {}) {
  const where = {
    status: 'HELD',
    holdExpiresAt: { lt: new Date() },
    ...(barberId ? { barberId } : {}),
    ...(from && to ? { startAt: { lt: to }, endAt: { gt: from } } : {}),
  };

  const { count } = await tx.appointment.updateMany({
    where,
    data: { status: 'OFFER_EXPIRED' },
  });
  return count;
}

/**
 * Raw open intervals for a barber over [from, to), before subtracting bookings.
 * Exported because the schedule service needs it to work out which slots an
 * admin's new OPEN window actually created.
 */
export async function computeOpenIntervals(tx, barber, from, to) {
  const rules = await tx.workingHoursRule.findMany({
    where: { barberId: barber.id, active: true },
  });

  // 1. Expand the weekly template across the requested local dates.
  const open = [];
  for (const day of eachLocalDate(from, to, barber.timezone)) {
    for (const rule of rules) {
      if (rule.weekday !== day.weekday) continue;
      open.push({
        start: localMinutesToUtc(day.iso, rule.startMinute, barber.timezone),
        end: localMinutesToUtc(day.iso, rule.endMinute, barber.timezone),
      });
    }
  }

  const exceptions = await tx.scheduleException.findMany({
    where: { barberId: barber.id, startAt: { lt: to }, endAt: { gt: from } },
  });

  // 2. OPEN exceptions add availability ("open 14:00-16:00 this Thursday").
  for (const ex of exceptions) {
    if (ex.kind === 'OPEN') open.push({ start: ex.startAt, end: ex.endAt });
  }

  // 3. BLOCK exceptions always win — applied last so they also cut OPEN windows.
  const blocks = exceptions
    .filter((ex) => ex.kind === 'BLOCK')
    .map((ex) => ({ start: ex.startAt, end: ex.endAt }));

  const clipped = mergeIntervals(open).map((iv) => ({
    start: iv.start < from ? from : iv.start,
    end: iv.end > to ? to : iv.end,
  }));

  return subtractIntervals(clipped, blocks);
}

/**
 * Bookable slot starts for one service over a range.
 *
 * @returns {Promise<{ barber, service, slots: Array<{startAt, endAt}> }>}
 */
export async function getAvailability({ barberId, serviceId, from, to, client = prisma, ignoreVacation = false }) {
  const barber = await client.barber.findUnique({ where: { id: barberId } });
  if (!barber) throw notFound('Barber not found');

  const service = await client.service.findFirst({
    where: { id: serviceId, barberId, active: true },
  });
  if (!service) throw notFound('Service not found');

  const horizon = addMinutes(new Date(), barber.maxAdvanceDays * 24 * 60);
  if (from >= to) throw badRequest('`from` must be before `to`');
  if (to > horizon) to = horizon;

  // Never let a forgotten hold hide a genuinely free slot.
  await releaseExpiredHolds(client, { barberId, from, to });

  // Vacation mode: the shop has no open hours at all (the barber's own tools pass ignoreVacation).
  const open = barber.vacationMode && !ignoreVacation ? [] : await computeOpenIntervals(client, barber, from, to);

  // Subtract everything already reserved. The stored endAt already includes the
  // shop buffer, so no extra padding is needed here.
  const busy = await client.appointment.findMany({
    where: {
      barberId,
      status: { in: BLOCKING_STATUSES },
      startAt: { lt: to },
      endAt: { gt: from },
    },
    select: { startAt: true, endAt: true },
  });

  const free = subtractIntervals(
    open,
    busy.map((b) => ({ start: b.startAt, end: b.endAt }))
  );

  // Slice each free interval into candidate starts.
  const totalMin = service.durationMin + barber.bufferMin;
  const earliest = addMinutes(new Date(), barber.minLeadTimeMin);
  const slots = [];

  for (const interval of free) {
    let cursor = ceilToGranularity(interval.start, barber.slotGranularityMin, barber.timezone);
    while (addMinutes(cursor, totalMin) <= interval.end) {
      if (cursor >= earliest) {
        slots.push({ startAt: new Date(cursor), endAt: addMinutes(cursor, totalMin) });
      }
      cursor = addMinutes(cursor, barber.slotGranularityMin);
    }
  }

  return { barber, service, slots };
}

/** Group slots by local date — the shape the React calendar consumes directly. */
export function groupByLocalDay(slots, timezone) {
  const days = new Map();
  for (const slot of slots) {
    const key = localDateKey(slot.startAt, timezone);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(slot.startAt.toISOString());
  }
  return [...days.entries()].map(([date, times]) => ({ date, times }));
}

/**
 * Is one specific slot bookable right now?
 * Used by the booking path before it attempts the insert — the exclusion
 * constraint is the real guard, but this produces a far better error message
 * than a generic 409 when the problem is "we're closed then".
 */
export async function isSlotBookable({ barberId, serviceId, startAt, client = prisma, ignoreVacation = false }) {
  const service = await client.service.findFirst({
    where: { id: serviceId, barberId, active: true },
  });
  if (!service) throw notFound('Service not found');

  const barber = await client.barber.findUniqueOrThrow({ where: { id: barberId } });
  const endAt = addMinutes(startAt, service.durationMin + barber.bufferMin);

  if (barber.vacationMode && !ignoreVacation) return { ok: false, reason: 'SHOP_CLOSED', endAt };

  if (startAt < addMinutes(new Date(), barber.minLeadTimeMin)) {
    return { ok: false, reason: 'TOO_SOON', endAt };
  }

  const open = await computeOpenIntervals(client, barber, startAt, endAt);
  const covered = open.some((iv) => iv.start <= startAt && iv.end >= endAt);
  if (!covered) return { ok: false, reason: 'OUTSIDE_HOURS', endAt };

  await releaseExpiredHolds(client, { barberId, from: startAt, to: endAt });

  const clash = await client.appointment.findFirst({
    where: {
      barberId,
      status: { in: BLOCKING_STATUSES },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  if (clash) return { ok: false, reason: 'SLOT_TAKEN', endAt };

  return { ok: true, endAt, service, barber };
}
