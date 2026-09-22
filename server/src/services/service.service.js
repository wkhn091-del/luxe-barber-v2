/**
 * ===========================================================================
 *  SERVICES — the dynamic menu
 * ===========================================================================
 *
 * The booking engine already reads these live: `getAvailability()` slices free
 * time by `service.durationMin + barber.bufferMin`, and the waitlist's
 * `pickCandidate()` filters on the same field. So editing a duration here
 * changes tomorrow's bookable slots with no deploy and no cache to bust.
 *
 * What it does NOT change is appointments already in the book. Each
 * `Appointment` row stores its own `startAt` and `endAt`, captured at booking
 * time — so shortening "Signature cut" from 45 to 30 minutes never silently
 * rewrites someone's existing 45-minute slot. That is a property of the schema,
 * not a special case, and it's the reason durations are safe to edit at all.
 */
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const MIN_DURATION = 5;
const MAX_DURATION = 480;
const MAX_PRICE_CENTS = 1_000_000;

function validate({ name, durationMin, priceCents }) {
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
    throw badRequest('Give the service a name.');
  }
  if (durationMin !== undefined) {
    if (!Number.isInteger(durationMin) || durationMin < MIN_DURATION || durationMin > MAX_DURATION) {
      throw badRequest(`Duration must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`);
    }
  }
  if (priceCents !== undefined) {
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > MAX_PRICE_CENTS) {
      throw badRequest('That price does not look right.');
    }
  }
}

export async function listServices(barberId, { includeInactive = false } = {}) {
  const services = await prisma.service.findMany({
    where: { barberId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  // The admin list shows usage, because "can I delete this?" is the first
  // question the barber has and answering it inline saves a round-trip.
  const counts = await prisma.appointment.groupBy({
    by: ['serviceId'],
    where: { barberId },
    _count: { _all: true },
  });
  const used = new Map(counts.map((c) => [c.serviceId, c._count._all]));

  return services.map((s) => ({ ...s, bookingCount: used.get(s.id) ?? 0 }));
}

export async function createService(barberId, data) {
  validate(data);

  const clash = await prisma.service.findFirst({
    where: { barberId, name: { equals: data.name.trim(), mode: 'insensitive' }, active: true },
  });
  if (clash) throw conflict('DUPLICATE_NAME', 'You already offer a service with that name.');

  const last = await prisma.service.aggregate({
    where: { barberId },
    _max: { sortOrder: true },
  });

  const service = await prisma.service.create({
    data: {
      barberId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      durationMin: data.durationMin,
      priceCents: data.priceCents,
      currency: data.currency ?? 'EUR',
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });

  logger.info('service created', { barberId, id: service.id, durationMin: service.durationMin });
  return service;
}

export async function updateService(barberId, id, data) {
  validate(data);

  const existing = await prisma.service.findFirst({ where: { id, barberId } });
  if (!existing) throw notFound('Service not found.');

  if (data.name && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.service.findFirst({
      where: {
        barberId,
        id: { not: id },
        name: { equals: data.name.trim(), mode: 'insensitive' },
        active: true,
      },
    });
    if (clash) throw conflict('DUPLICATE_NAME', 'You already offer a service with that name.');
  }

  const service = await prisma.service.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.durationMin !== undefined ? { durationMin: data.durationMin } : {}),
      ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });

  // Worth surfacing to the UI: a duration change only moves FUTURE slots.
  const upcoming =
    data.durationMin !== undefined && data.durationMin !== existing.durationMin
      ? await prisma.appointment.count({
          where: { serviceId: id, status: { in: ['CONFIRMED', 'HELD', 'PENDING'] }, startAt: { gt: new Date() } },
        })
      : 0;

  logger.info('service updated', { barberId, id, upcomingUnaffected: upcoming });
  return { service, upcomingUnaffected: upcoming };
}

/**
 * Delete, or retire.
 *
 * `Appointment.serviceId` and `WaitlistEntry.serviceId` are required relations,
 * so a hard delete of a service anyone has ever booked would either fail on the
 * foreign key or destroy history. Neither is acceptable — the barber wants last
 * year's takings to still add up.
 *
 * So: a service nobody has ever used is really deleted. A service with history
 * is deactivated, which removes it from the public menu and from waitlist
 * matching while leaving every past booking intact and readable.
 */
export async function removeService(barberId, id) {
  const service = await prisma.service.findFirst({ where: { id, barberId } });
  if (!service) throw notFound('Service not found.');

  const [appointments, waitlisted] = await Promise.all([
    prisma.appointment.count({ where: { serviceId: id } }),
    prisma.waitlistEntry.count({ where: { serviceId: id, status: { in: ['ACTIVE', 'OFFERED'] } } }),
  ]);

  if (appointments === 0 && waitlisted === 0) {
    await prisma.service.delete({ where: { id } });
    logger.info('service deleted', { barberId, id });
    return { deleted: true };
  }

  await prisma.service.update({ where: { id }, data: { active: false } });
  logger.info('service retired', { barberId, id, appointments, waitlisted });

  return {
    deleted: false,
    retired: true,
    appointments,
    waitlisted,
  };
}

/** Drag-to-reorder on the admin list; the public menu reads `sortOrder`. */
export async function reorderServices(barberId, orderedIds) {
  const owned = await prisma.service.findMany({
    where: { barberId, id: { in: orderedIds } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) throw badRequest('Unknown service in the order.');

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.service.update({ where: { id }, data: { sortOrder: index + 1 } })
    )
  );
  return { ok: true };
}

/**
 * "How many of these fit in a week?"
 *
 * Powers the live figure in the service editor, so the barber sees the
 * consequence of a duration while they're choosing it rather than discovering
 * it a week later.
 *
 * Counted per contiguous opening, not per day: you cannot run a 45-minute cut
 * across a lunch break, so a 09:00-13:00 / 14:00-19:00 day fits
 * floor(240/50) + floor(300/50) = 4 + 6, not floor(540/50) = 10.
 */
export function estimateFitsPerWeek({ rules, durationMin, bufferMin = 0, granularityMin = 15 }) {
  const block = durationMin + bufferMin;
  if (block <= 0) return { perWeek: 0, perWeekday: {}, wastePerBlock: 0 };

  const perWeekday = {};
  let perWeek = 0;

  for (const rule of rules) {
    if (rule.active === false) continue;
    const minutes = rule.endMinute - rule.startMinute;
    const fits = Math.floor(minutes / block);
    perWeekday[rule.weekday] = (perWeekday[rule.weekday] ?? 0) + fits;
    perWeek += fits;
  }

  // A duration that doesn't land on the slot grid leaves a sliver at the end of
  // every appointment that nothing can be booked into. Ten minutes lost per cut
  // is an hour a day, so the editor warns about it.
  const offGrid = block % granularityMin;

  return {
    perWeek,
    perWeekday,
    wastePerBlock: offGrid === 0 ? 0 : granularityMin - offGrid,
  };
}
