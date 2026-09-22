/**
 * Booking service.
 *
 * Payment is cash on site, so there is no pending-payment state: a booking is
 * CONFIRMED the moment it is created. That is a business decision, not a
 * shortcut — see docs/ARCHITECTURE.md §10 for what changes if deposits are
 * introduced to fight no-shows.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma, lockSlot } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { publicToken } from '../lib/tokens.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound, conflict, isSlotCollision } from '../lib/errors.js';
import { enqueue, enqueueForBarber } from '../notifications/index.js';
import { isSlotBookable, releaseExpiredHolds } from './availability.service.js';
import { offerSlotToNextCandidate } from './waitlist.service.js';
import { remindersAlreadyCovered } from '../lib/reminders.js';

/** Normalise to E.164 so the phone number can serve as the client's natural key. */
export function normalisePhone(raw) {
  const parsed = parsePhoneNumberFromString(raw ?? '', env.DEFAULT_COUNTRY_CODE);
  if (!parsed?.isValid()) throw badRequest('Invalid phone number');
  return parsed.number;
}

/** Find-or-create by phone, refreshing the name if it was left blank before. */
export async function upsertClient(tx, { name, phone, email, locale, marketingOptIn }) {
  const e164 = normalisePhone(phone);
  // Marketing consent is only ever GIVEN here — an unticked box at booking must
  // never silently unsubscribe someone. It is withdrawn through the email link.
  const consent = marketingOptIn ? { marketingOptIn: true, marketingOptInAt: new Date() } : {};
  return tx.client.upsert({
    where: { phone: e164 },
    update: {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(locale ? { locale } : {}),
      ...consent,
    },
    create: { phone: e164, name, email, locale: locale ?? 'fr', ...consent },
  });
}

/**
 * Create a booking.
 *
 * Three layers of protection, in order of usefulness to the user:
 *   1. `isSlotBookable` → a precise reason ("we're closed then", "too soon");
 *   2. the advisory lock → serialises concurrent attempts on this slot;
 *   3. the exclusion constraint → the actual guarantee. If (1) and (2) are ever
 *      wrong, this still cannot produce a double booking.
 */
export async function createAppointment({
  barberId,
  serviceId,
  startAt,
  clientInput,
  source = 'WEB',
  clientNote,
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockSlot(tx, barberId, startAt);
      await releaseExpiredHolds(tx, { barberId });

      // The barber may still book by hand while the shop is closed to the public.
      const check = await isSlotBookable({ barberId, serviceId, startAt, client: tx, ignoreVacation: source === 'ADMIN' });
      if (!check.ok) {
        const messages = {
          TOO_SOON: 'That slot is too close to now — please pick a later time.',
          OUTSIDE_HOURS: 'The shop is closed at that time.',
          SLOT_TAKEN: 'That slot has just been taken.',
          SHOP_CLOSED: 'המספרה סגורה כרגע, נחזור בקרוב.',
        };
        throw conflict(check.reason, messages[check.reason]);
      }

      const client = await upsertClient(tx, clientInput);

      const appointment = await tx.appointment.create({
        data: {
          barberId,
          clientId: client.id,
          serviceId,
          startAt,
          endAt: check.endAt,
          status: 'CONFIRMED',
          source,
          clientNote,
          manageToken: publicToken(),
          // Booked inside a reminder's window? The confirmation covers it.
          ...remindersAlreadyCovered(startAt),
        },
      });

      await enqueue(tx, {
        client,
        template: 'BOOKING_CONFIRMED',
        data: { barber: check.barber, service: check.service, appointment },
      });

      // The barber hears about it too — unless he booked it himself.
      if (source !== 'ADMIN') {
        await enqueueForBarber(tx, {
          template: 'ADMIN_NEW_BOOKING',
          data: { client, barber: check.barber, service: check.service, appointment, via: source },
        });
      }

      logger.info('appointment created', { id: appointment.id, source });
      return { appointment, client, service: check.service, barber: check.barber };
    });
  } catch (err) {
    // The constraint firing means someone committed first — a normal outcome
    // under load, not an error condition.
    if (isSlotCollision(err)) {
      throw conflict('SLOT_TAKEN', 'That slot has just been taken.');
    }
    throw err;
  }
}

export async function getAppointmentByToken(manageToken) {
  // Only what the client's manage page shows — not the whole row.
  const appointment = await prisma.appointment.findUnique({
    where: { manageToken },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      cancelledAt: true,
      service: { select: { name: true, durationMin: true, priceCents: true, currency: true } },
      barber: { select: { name: true, timezone: true, addressLine: true, phone: true, wazeUrl: true } },
      client: { select: { name: true } },
    },
  });
  if (!appointment) throw notFound('Appointment not found');
  return appointment;
}

/**
 * Cancel, then immediately try to refill from the waitlist.
 *
 * This is the primary `slot.opened` trigger. The cascade deliberately runs
 * AFTER the cancelling transaction commits: the slot must be genuinely free in
 * the database before anyone is offered it, and a failure to find a candidate
 * must never roll back the cancellation.
 */
export async function cancelAppointment({ manageToken, id, cancelledBy = 'CLIENT' }) {
  const freed = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: manageToken ? { manageToken } : { id },
      include: { client: true, barber: true, service: true },
    });
    if (!appointment) throw notFound('Appointment not found');

    if (!['CONFIRMED', 'PENDING'].includes(appointment.status)) {
      const why = { CANCELLED: 'התור הזה כבר בוטל.', COMPLETED: 'התור הזה כבר הסתיים.', NO_SHOW: 'התור הזה כבר עבר.' };
      throw conflict('NOT_CANCELLABLE', why[appointment.status] ?? 'אי אפשר לבטל את התור הזה.');
    }
    // A client cannot cancel from the link once the appointment has begun.
    if (cancelledBy === 'CLIENT' && appointment.startAt <= new Date()) {
      throw conflict('ALREADY_STARTED', 'התור כבר התחיל, ולכן אי אפשר לבטל אותו מכאן. לשאלות — התקשרו למספרה.');
    }

    await lockSlot(tx, appointment.barberId, appointment.startAt);

    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy },
    });

    // Tell the client only when the barber cancelled — they already know if they
    // pressed the button themselves.
    if (cancelledBy === 'ADMIN') {
      await enqueue(tx, {
        client: appointment.client,
        template: 'APPOINTMENT_CANCELLED',
        data: { barber: appointment.barber, appointment },
      });
    }
    // …and the barber hears when the CLIENT cancelled: the freed time is his.
    if (cancelledBy === 'CLIENT') {
      await enqueueForBarber(tx, {
        template: 'ADMIN_APPOINTMENT_CANCELLED',
        data: { client: appointment.client, barber: appointment.barber, service: appointment.service, appointment },
      });
    }

    return {
      barberId: appointment.barberId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      serviceId: appointment.serviceId,
    };
  });

  // The cancellation is committed at this point, and the slot is already free
  // and bookable on the site. If offering it to the waitlist fails, that is
  // logged — never reported to the client as a failed cancellation, which it
  // is not (they would retry, or call the shop, confused).
  let waitlist = 'error';
  try {
    waitlist = (await offerSlotToNextCandidate({ ...freed, reason: 'cancellation' })).status;
  } catch (err) {
    logger.error('waitlist offer after cancellation failed', { ...freed, error: err.message });
  }
  logger.info('appointment cancelled', { ...freed, waitlist });
  return { ok: true, waitlist };
}

/** Admin transitions: COMPLETED / NO_SHOW / CONFIRMED. */
export async function updateAppointmentStatus({ id, status }) {
  const allowed = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'];
  if (!allowed.includes(status)) throw badRequest(`status must be one of ${allowed.join(', ')}`);

  return prisma.$transaction(async (tx) => {
    // Re-confirming (a no-show corrected, say) must not fire a reminder whose
    // moment already passed. Markers that are already set stay as they are.
    let markers = {};
    if (status === 'CONFIRMED') {
      const current = await tx.appointment.findUniqueOrThrow({
        where: { id },
        select: { startAt: true, reminder2SentAt: true, reminder24SentAt: true },
      });
      markers = Object.fromEntries(
        Object.entries(remindersAlreadyCovered(current.startAt)).filter(([column]) => current[column] == null)
      );
    }
    const appointment = await tx.appointment.update({ where: { id }, data: { status, ...markers } });
    if (status === 'NO_SHOW') {
      await tx.client.update({
        where: { id: appointment.clientId },
        data: { noShowCount: { increment: 1 } },
      });
    }
    return appointment;
  });
}

export async function listAppointments({ barberId, from, to }) {
  return prisma.appointment.findMany({
    where: {
      barberId,
      startAt: { gte: from, lt: to },
      status: { notIn: ['OFFER_EXPIRED'] },
    },
    orderBy: { startAt: 'asc' },
    include: {
      // email: the admin shows who gets automated mail and who needs WhatsApp.
      client: {
        select: { id: true, name: true, phone: true, email: true, vip: true, noShowCount: true },
      },
      service: { select: { id: true, name: true, durationMin: true, priceCents: true } },
      // A HELD row is a live waitlist offer; its token lets the barber resend
      // the confirm link by hand on WhatsApp.
      offer: { select: { token: true, expiresAt: true, status: true } },
    },
  });
}
