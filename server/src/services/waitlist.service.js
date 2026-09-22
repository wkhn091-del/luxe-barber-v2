/**
 * ===========================================================================
 *  SMART VIP WAITLIST — the offer engine
 * ===========================================================================
 *
 * Contract:
 *   1. A freed slot is offered to exactly ONE person at a time.
 *   2. That person has a bounded window (default 15 min) to confirm.
 *   3. Silence or a decline releases the slot and cascades to the next
 *      candidate, with no human in the loop.
 *   4. Nobody is offered the same slot twice.
 *   5. The slot cannot be booked out from under the offer.
 *
 * How each is enforced:
 *   (1) the offer is backed by a real Appointment row with status HELD, and a
 *       Postgres exclusion constraint forbids overlapping HELD/CONFIRMED rows;
 *   (2) the deadline lives in the database (`expiresAt`), never in a timer;
 *   (3) `expireOffer()` runs from the sweeper AND from any request that touches
 *       the slot, then recurses;
 *   (4) the SlotOffer table is the per-slot ledger the picker excludes against,
 *       which also bounds the recursion;
 *   (5) same exclusion constraint as (1).
 *
 * Nothing here depends on in-memory state, so a restart mid-offer is safe.
 */
import { prisma, lockSlot } from '../lib/prisma.js';
import { publicToken } from '../lib/tokens.js';
import { logger } from '../lib/logger.js';
import { notFound, gone, conflict, isSlotCollision } from '../lib/errors.js';
import { enqueue, enqueueForBarber } from '../notifications/index.js';
import { releaseExpiredHolds } from './availability.service.js';
import {
  addMinutes,
  minutesBetween,
  localWeekday,
  timePreferenceOf,
  weekdayMatchesMask,
} from '../lib/time.js';
import { remindersAlreadyCovered } from '../lib/reminders.js';

/** Safety valve: a single freed slot may never chain more than this many offers. */
const MAX_CASCADE_DEPTH = 25;

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * Who should be offered this slot?
 *
 * Coarse filtering in SQL (status, service, date window), fine filtering in JS
 * (weekday bitmask, time-of-day) because both need the barber's timezone and the
 * candidate set is small — tens of rows, not millions.
 *
 * Ordering is the fairness promise: priority DESC (VIPs, admin promotions),
 * then createdAt ASC (strict FIFO). It is backed by
 * @@index([barberId, status, priority, createdAt]).
 */
async function pickCandidate(tx, { barber, slotStartAt, slotEndAt, serviceId, excludeEntryIds }) {
  const durationMin = minutesBetween(slotStartAt, slotEndAt);

  const candidates = await tx.waitlistEntry.findMany({
    where: {
      barberId: barber.id,
      status: 'ACTIVE',
      // Must want a service that fits inside the freed slot. When the slot came
      // from a specific service we match it exactly; otherwise any service short
      // enough will do.
      ...(serviceId
        ? { serviceId }
        : { service: { active: true, durationMin: { lte: durationMin - barber.bufferMin } } }),
      earliestDate: { lte: slotStartAt },
      latestDate: { gte: slotStartAt },
      ...(excludeEntryIds.length ? { id: { notIn: excludeEntryIds } } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { client: true, service: true },
    take: 50,
  });

  const weekday = localWeekday(slotStartAt, barber.timezone);
  const bucket = timePreferenceOf(slotStartAt, barber.timezone);

  return (
    candidates.find((entry) => {
      if (!weekdayMatchesMask(weekday, entry.weekdayMask)) return false;
      if (entry.timePref !== 'ANY' && entry.timePref !== bucket) return false;
      if (entry.service.durationMin + barber.bufferMin > durationMin) return false;
      return true;
    }) ?? null
  );
}

/**
 * How long should this offer live?
 *
 * The full TTL, shortened so the window always closes with enough lead time
 * before the appointment itself. Offering a 16:00 slot at 15:55 with a
 * 15-minute window would mean confirming ten minutes after the haircut should
 * have started — so we shrink, and if the result is too short to be realistic
 * we skip this candidate and move on.
 */
function computeOfferTtl(barber, slotStartAt, now = new Date()) {
  const untilSlot = minutesBetween(now, slotStartAt);
  const usable = Math.floor(untilSlot - barber.offerLeadBufferMin);
  return Math.min(barber.offerTtlMin, usable);
}

// ---------------------------------------------------------------------------
// Offering
// ---------------------------------------------------------------------------

/**
 * Offer a freed slot to the next eligible person.
 *
 * Idempotent and safe to call concurrently: the advisory lock serialises all
 * work on this (barber, slot), and the exclusion constraint is the final word.
 *
 * @returns {Promise<{status:'offered'|'no_candidate'|'slot_taken'|'too_late', offer?}>}
 */
export async function offerSlotToNextCandidate({
  barberId,
  startAt,
  endAt,
  serviceId = null,
  reason = 'slot_opened',
  depth = 0,
}) {
  if (depth > MAX_CASCADE_DEPTH) {
    logger.warn('waitlist cascade depth exceeded', { barberId, startAt, depth });
    return { status: 'no_candidate' };
  }

  const result = await prisma.$transaction(async (tx) => {
    // (a) Serialise everything touching this slot, across all processes.
    await lockSlot(tx, barberId, startAt);

    const barber = await tx.barber.findUniqueOrThrow({ where: { id: barberId } });

    // (b) Lazy expiry — a stale hold must not make a free slot look taken.
    await releaseExpiredHolds(tx, { barberId, from: startAt, to: endAt });

    // (c) Still free?
    const clash = await tx.appointment.findFirst({
      where: {
        barberId,
        status: { in: ['HELD', 'PENDING', 'CONFIRMED'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (clash) return { status: 'slot_taken' };

    // (d) Per-slot ledger: anyone who already saw this slot is out. This is what
    //     stops the cascade looping and what makes "sequential" actually mean
    //     down the list rather than round in a circle.
    const priorOffers = await tx.slotOffer.findMany({
      where: { barberId, slotStartAt: startAt },
      select: { waitlistEntryId: true },
    });
    const excludeEntryIds = [...new Set(priorOffers.map((o) => o.waitlistEntryId))];

    // (e) Walk the queue until someone is offerable in the remaining time.
    let candidate = null;
    let ttl = 0;
    const skipped = [...excludeEntryIds];

    for (;;) {
      candidate = await pickCandidate(tx, {
        barber,
        slotStartAt: startAt,
        slotEndAt: endAt,
        serviceId,
        excludeEntryIds: skipped,
      });
      if (!candidate) return { status: 'no_candidate' };

      ttl = computeOfferTtl(barber, startAt);
      // TTL depends only on the clock, not the candidate — if it's too short for
      // one person it's too short for everyone, so stop rather than spin.
      if (ttl < barber.offerMinTtlMin) return { status: 'too_late' };
      break;
    }

    const attemptNumber = excludeEntryIds.length + 1;
    const expiresAt = addMinutes(new Date(), ttl);

    // (f) Create the hold. This IS the reservation — see docs/ARCHITECTURE.md §3.
    const appointment = await tx.appointment.create({
      data: {
        barberId,
        clientId: candidate.clientId,
        serviceId: candidate.serviceId,
        startAt,
        endAt,
        status: 'HELD',
        source: 'WAITLIST',
        holdExpiresAt: expiresAt,
        manageToken: publicToken(),
      },
    });

    const offer = await tx.slotOffer.create({
      data: {
        barberId,
        waitlistEntryId: candidate.id,
        appointmentId: appointment.id,
        slotStartAt: startAt,
        slotEndAt: endAt,
        status: 'SENT',
        expiresAt,
        attemptNumber,
        token: publicToken(),
      },
    });

    await tx.waitlistEntry.update({
      where: { id: candidate.id },
      data: { status: 'OFFERED', lastOfferedAt: new Date() },
    });

    // (g) Outbox write, same transaction. Either the hold and the message both
    //     exist, or neither does.
    await enqueue(tx, {
      client: candidate.client,
      template: 'WAITLIST_OFFER',
      data: { barber, service: candidate.service, offer, minutes: ttl },
    });

    logger.info('waitlist offer sent', {
      barberId,
      offerId: offer.id,
      attemptNumber,
      ttl,
      reason,
      clientId: candidate.clientId,
    });

    return { status: 'offered', offer, appointment, ttl };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Responding to an offer
// ---------------------------------------------------------------------------

/**
 * Client tapped "Confirm".
 *
 * The deadline is re-checked server-side inside the transaction — the countdown
 * shown in the browser is decoration, and a client whose phone clock is wrong or
 * who replays a stale link gets the same answer as everyone else.
 */
export async function confirmOffer(token) {
  const outcome = await prisma.$transaction(async (tx) => {
    const offer = await tx.slotOffer.findUnique({
      where: { token },
      include: { appointment: true, waitlistEntry: { include: { client: true, service: true } } },
    });
    if (!offer) throw notFound('Offer not found');

    await lockSlot(tx, offer.barberId, offer.slotStartAt);

    // Closed for vacation since the offer went out? Then it cannot be taken.
    const shop = await tx.barber.findUnique({ where: { id: offer.barberId }, select: { vacationMode: true } });
    if (shop?.vacationMode) throw conflict('SHOP_CLOSED', 'המספרה סגורה כרגע, נחזור בקרוב.');

    // Re-read under the lock: the sweeper may have expired it microseconds ago.
    const fresh = await tx.slotOffer.findUnique({ where: { id: offer.id } });
    if (fresh.status !== 'SENT') {
      throw gone('OFFER_CLOSED', `This offer is no longer available (${fresh.status.toLowerCase()}).`);
    }
    if (fresh.expiresAt <= new Date()) {
      throw gone('OFFER_EXPIRED', 'This offer has expired and has been passed to the next person.');
    }

    const barber = await tx.barber.findUniqueOrThrow({ where: { id: offer.barberId } });

    // HELD → CONFIRMED. The row never leaves the exclusion constraint's
    // predicate, so there is no instant at which the slot is unprotected.
    const appointment = await tx.appointment.update({
      where: { id: offer.appointmentId },
      // A slot offered minutes before it starts has no reminders left to send.
      data: { status: 'CONFIRMED', holdExpiresAt: null, ...remindersAlreadyCovered(offer.slotStartAt) },
    });

    await tx.slotOffer.update({
      where: { id: offer.id },
      data: { status: 'CONFIRMED', respondedAt: new Date() },
    });

    await tx.waitlistEntry.update({
      where: { id: offer.waitlistEntryId },
      data: { status: 'CONVERTED' },
    });

    await enqueue(tx, {
      client: offer.waitlistEntry.client,
      template: 'BOOKING_CONFIRMED',
      data: { barber, service: offer.waitlistEntry.service, appointment },
    });
    await enqueueForBarber(tx, {
      template: 'ADMIN_NEW_BOOKING',
      data: { client: offer.waitlistEntry.client, barber, service: offer.waitlistEntry.service, appointment, via: 'WAITLIST' },
    });

    logger.info('waitlist offer confirmed', { offerId: offer.id, appointmentId: appointment.id });
    return { appointment, barber, service: offer.waitlistEntry.service };
  });

  return outcome;
}

/**
 * Client tapped "Can't make it".
 *
 * Deliberately treated as a courtesy, not a miss: declining costs no
 * `missedOffers` penalty, because the whole point is to get the slot moving
 * immediately instead of waiting out the full 15 minutes.
 */
export async function declineOffer(token) {
  const released = await prisma.$transaction(async (tx) => {
    const offer = await tx.slotOffer.findUnique({ where: { token } });
    if (!offer) throw notFound('Offer not found');

    await lockSlot(tx, offer.barberId, offer.slotStartAt);
    if (offer.status !== 'SENT') throw gone('OFFER_CLOSED', 'This offer is already closed.');

    await tx.slotOffer.update({
      where: { id: offer.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await tx.appointment.update({
      where: { id: offer.appointmentId },
      data: { status: 'OFFER_EXPIRED' },
    });
    await tx.waitlistEntry.update({
      where: { id: offer.waitlistEntryId },
      data: { status: 'ACTIVE' },
    });

    return {
      barberId: offer.barberId,
      startAt: offer.slotStartAt,
      endAt: offer.slotEndAt,
    };
  });

  // Cascade outside the transaction so the next offer gets its own lock cleanly.
  await offerSlotToNextCandidate({ ...released, reason: 'declined' });
  return { ok: true };
}

/**
 * Timeout path. Called by the sweeper for every SENT offer past its deadline.
 *
 * Split in two on purpose: the state change runs in a transaction, then the
 * cascade runs as a fresh transaction with a fresh lock. Holding the lock across
 * both would serialise unrelated slots and make a stuck notification block the
 * whole queue.
 */
export async function expireOffer(offerId, { depth = 0 } = {}) {
  const released = await prisma.$transaction(async (tx) => {
    const offer = await tx.slotOffer.findUnique({
      where: { id: offerId },
      include: { waitlistEntry: { include: { client: true } } },
    });
    if (!offer || offer.status !== 'SENT') return null;

    await lockSlot(tx, offer.barberId, offer.slotStartAt);

    // Re-read under the lock: a confirmation may have landed in the meantime,
    // in which case we must not touch anything.
    const fresh = await tx.slotOffer.findUnique({ where: { id: offerId } });
    if (fresh.status !== 'SENT') return null;
    if (fresh.expiresAt > new Date()) return null; // not actually due yet

    const barber = await tx.barber.findUniqueOrThrow({ where: { id: offer.barberId } });

    await tx.slotOffer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
    await tx.appointment.update({
      where: { id: offer.appointmentId },
      data: { status: 'OFFER_EXPIRED' },
    });

    // Repeated silence retires the entry — otherwise one unreachable number sits
    // at the head of the queue absorbing the first 15 minutes of every opening.
    const missed = offer.waitlistEntry.missedOffers + 1;
    const retire = missed >= barber.maxMissedOffers;

    await tx.waitlistEntry.update({
      where: { id: offer.waitlistEntryId },
      data: { missedOffers: missed, status: retire ? 'EXPIRED' : 'ACTIVE' },
    });

    await enqueue(tx, {
      client: offer.waitlistEntry.client,
      template: 'WAITLIST_OFFER_EXPIRED',
      data: { barber, offer },
    });

    logger.info('waitlist offer expired', {
      offerId,
      missed,
      retired: retire,
      attemptNumber: offer.attemptNumber,
    });

    return { barberId: offer.barberId, startAt: offer.slotStartAt, endAt: offer.slotEndAt };
  });

  if (!released) return { cascaded: false };

  const next = await offerSlotToNextCandidate({
    ...released,
    reason: 'cascade',
    depth: depth + 1,
  });
  return { cascaded: next.status === 'offered', next: next.status };
}

/** Sweeper entry point: expire everything that is due, cascading each. */
export async function expireDueOffers({ limit = 50 } = {}) {
  const due = await prisma.slotOffer.findMany({
    where: { status: 'SENT', expiresAt: { lte: new Date() } },
    orderBy: { expiresAt: 'asc' },
    select: { id: true },
    take: limit,
  });

  let cascaded = 0;
  for (const { id } of due) {
    try {
      const res = await expireOffer(id);
      if (res.cascaded) cascaded += 1;
    } catch (err) {
      logger.error('expireOffer failed', { offerId: id, error: err.message });
    }
  }
  return { expired: due.length, cascaded };
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

export async function joinWaitlist({
  barberId,
  serviceId,
  client,
  earliestDate,
  latestDate,
  weekdayMask = 127,
  timePref = 'ANY',
}) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findFirst({
      where: { id: serviceId, barberId, active: true },
    });
    if (!service) throw notFound('Service not found');

    const existing = await tx.waitlistEntry.findFirst({
      where: { clientId: client.id, serviceId, status: { in: ['ACTIVE', 'OFFERED'] } },
    });
    if (existing) throw conflict('ALREADY_QUEUED', "You're already on the waitlist for this service.");

    const entry = await tx.waitlistEntry.create({
      data: {
        barberId,
        clientId: client.id,
        serviceId,
        earliestDate,
        latestDate,
        weekdayMask,
        timePref,
        // VIPs jump the queue; everyone else is pure FIFO.
        priority: client.vip ? 100 : 0,
        manageToken: publicToken(),
      },
    });

    const position = await tx.waitlistEntry.count({
      where: {
        barberId,
        serviceId,
        status: 'ACTIVE',
        OR: [
          { priority: { gt: entry.priority } },
          { priority: entry.priority, createdAt: { lte: entry.createdAt } },
        ],
      },
    });

    await enqueue(tx, {
      client,
      template: 'WAITLIST_JOINED',
      data: { service, position },
    });

    return { entry, position };
  });
}

export async function leaveWaitlist(manageToken) {
  const entry = await prisma.waitlistEntry.findUnique({ where: { manageToken } });
  if (!entry) throw notFound('Waitlist entry not found');

  // Leaving while holding a live offer must release the slot, not strand it.
  if (entry.status === 'OFFERED') {
    const live = await prisma.slotOffer.findFirst({
      where: { waitlistEntryId: entry.id, status: 'SENT' },
    });
    if (live) await declineOffer(live.token);
  }

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: 'CANCELLED' },
  });
  return { ok: true };
}

/** Live queue for the admin dashboard, with computed positions. */
export async function listWaitlist(barberId) {
  const entries = await prisma.waitlistEntry.findMany({
    where: { barberId, status: { in: ['ACTIVE', 'OFFERED'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: {
      client: { select: { id: true, name: true, phone: true, email: true, vip: true } },
      service: { select: { id: true, name: true, durationMin: true } },
      offers: {
        where: { status: 'SENT' },
        select: { token: true, slotStartAt: true, expiresAt: true, attemptNumber: true },
      },
    },
  });

  return entries.map((e, i) => ({
    ...e,
    position: i + 1,
    liveOffer: e.offers[0] ?? null,
    offers: undefined,
  }));
}

/**
 * Admin override: hand a specific slot to a specific person, skipping the queue.
 * Uses the same machinery — hold, offer, TTL, cascade on timeout — so a
 * promoted client is not a special case anywhere downstream.
 */
export async function promoteEntry({ entryId, startAt, endAt }) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: { client: true, service: true },
  });
  if (!entry) throw notFound('Waitlist entry not found');
  if (entry.status !== 'ACTIVE') throw conflict('NOT_ACTIVE', 'This entry is not active.');

  // Priority bump + a pre-seeded exclusion ledger is all it takes: the normal
  // picker will now choose this entry first.
  await prisma.waitlistEntry.update({
    where: { id: entryId },
    data: { priority: entry.priority + 1000 },
  });

  try {
    return await offerSlotToNextCandidate({
      barberId: entry.barberId,
      startAt,
      endAt,
      serviceId: entry.serviceId,
      reason: 'admin_promote',
    });
  } catch (err) {
    if (isSlotCollision(err)) throw conflict('SLOT_TAKEN', 'That slot was just taken.');
    throw err;
  }
}
