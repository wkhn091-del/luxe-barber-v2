/**
 * The barber's private calendar feed: every appointment, live in the calendar
 * app on his phone — iPhone Calendar, Google Calendar, Outlook.
 *
 * A calendar subscription cannot log in, so the URL IS the key: a long random
 * token stored on the barber's row. Random rather than derived, so "reset"
 * (a new random value) cuts off every old copy of the link at once — the
 * answer to "I shared it by mistake".
 *
 * The last 30 days and the next 180. Cancelled appointments are left out, so
 * the calendar app removes them on its next refresh.
 */
import crypto from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma.js';
import { buildIcsCalendar } from '../lib/ics.js';
import { apiOrigin } from '../lib/exportLink.js';

const DAY = 86_400_000;
const SHOWN = ['CONFIRMED', 'PENDING', 'COMPLETED', 'NO_SHOW'];

export function feedLinks(token) {
  const url = `${apiOrigin()}/api/calendar/${token}.ics`;
  const webcal = url.replace(/^https?:/, 'webcal:');
  return { url, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}

/** The barber's links, creating the token on first use; `reset` replaces it. */
export async function calendarFeedLinks(barberId, { reset = false } = {}) {
  const barber = await prisma.barber.findUnique({ where: { id: barberId }, select: { calendarFeedToken: true } });
  let token = barber?.calendarFeedToken;
  if (!token || reset) {
    token = crypto.randomBytes(24).toString('base64url');
    await prisma.barber.update({ where: { id: barberId }, data: { calendarFeedToken: token } });
  }
  return feedLinks(token);
}

/** @returns {Promise<string|null>} the feed as iCalendar text, or null for an unknown token. */
export async function calendarFeed(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token ?? ''))) return null;
  const barber = await prisma.barber.findUnique({ where: { calendarFeedToken: token } });
  if (!barber) return null;

  const now = Date.now();
  const appointments = await prisma.appointment.findMany({
    where: { barberId: barber.id, status: { in: SHOWN }, startAt: { gte: new Date(now - 30 * DAY), lte: new Date(now + 180 * DAY) } },
    orderBy: { startAt: 'asc' },
    take: 5000,
    include: {
      client: { select: { name: true, phone: true, email: true } },
      service: { select: { name: true, durationMin: true } },
    },
  });

  const host = new URL(apiOrigin()).host;
  const events = appointments.map((a) => {
    const phone = parsePhoneNumberFromString(String(a.client?.phone ?? ''));
    const phoneLine = phone?.isValid() ? phone.formatNational() : a.client?.phone;
    return {
      uid: `appointment-${a.id}-feed@${host}`,
      start: a.startAt,
      end: a.service?.durationMin ? new Date(a.startAt.getTime() + a.service.durationMin * 60_000) : a.endAt,
      summary: [a.status === 'NO_SHOW' ? 'לא הגיע' : null, a.client?.name, a.service?.name].filter(Boolean).join(' · '),
      description: [
        phoneLine && `טלפון: ${phoneLine}`,
        a.client?.email && `מייל: ${a.client.email}`,
        a.clientNote && `הערה: ${a.clientNote}`,
        a.status === 'PENDING' ? 'ממתין לאישור' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      location: barber.addressLine || undefined,
      status: a.status === 'PENDING' ? 'TENTATIVE' : 'CONFIRMED',
    };
  });

  return buildIcsCalendar({ events, name: `${barber.name} · תורים`, refreshMinutes: 15 });
}
