/**
 * The appointments report, as a CSV that Excel opens correctly on the first
 * double-click:
 *
 *   - a UTF-8 byte-order mark, or Excel reads the Hebrew as gibberish;
 *   - CRLF line endings and RFC 4180 quoting;
 *   - no formula injection: a client who types "=HYPERLINK(...)" as their name
 *     must not get a live formula into the barber's spreadsheet, so any cell
 *     starting with = + - @ gets a leading apostrophe.
 *
 * Every real appointment — no waitlist holds, no cancellations — oldest first,
 * in Israel time, with dates and times as text (see asDate below).
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma.js';
import { SHOP_TIMEZONE } from '../lib/timezone.js';

const STATUS = { CONFIRMED: 'מאושר', COMPLETED: 'הושלם', NO_SHOW: 'לא הגיע', PENDING: 'ממתין' };
const SOURCE = { WEB: 'אתר', ADMIN: 'ידני', WAITLIST: 'רשימת המתנה' };
const HEADER = ['תאריך', 'יום', 'שעה', 'לקוח', 'טלפון', 'מייל', 'שירות', 'משך (דקות)', 'מחיר (₪)', 'סטטוס', 'מקור', 'הערת לקוח', 'נקבע בתאריך'];

/**
 * Left out of the report: live waitlist holds (not bookings yet) and
 * cancellations — a cancelled slot sitting next to its rebooking read as a
 * duplicate, and only cluttered the sheet.
 */
const LEFT_OUT = ['HELD', 'CANCELLED'];

/**
 * Dates and times leave as TEXT: "22/09/2026", "10:00".
 *
 * Spreadsheets turn anything date-shaped into an internal serial number
 * (22/09/2026 → 46287, 10:00 → 0.4166667), and IMPORTDATA then shows the bare
 * number. An invisible LEFT-TO-RIGHT MARK in front stops the conversion: the
 * cell stays text and reads exactly as written — in Google Sheets and in Excel,
 * in any locale, with no 09/22-versus-22/09 guessing.
 */
const LRM = '\u200E';
const dateText = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeText = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const asDate = (at) => `${LRM}${dateText.format(at)}`;
export const asTime = (at) => `${LRM}${timeText.format(at)}`;

export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, { bom = true } = {}) {
  return `${bom ? '\uFEFF' : ''}${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function appointmentsCsv(barberId, { bom = true } = {}) {
  // One record per appointment: `include` nests the client and the service as
  // objects — it cannot multiply rows the way a SQL join can. Two rows for the
  // same person are two appointments.
  const appointments = await prisma.appointment.findMany({
    where: { barberId, status: { notIn: LEFT_OUT } },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }], // chronological; ties in booking order
    take: 20_000,
    include: {
      client: { select: { name: true, phone: true, email: true } },
      service: { select: { name: true, durationMin: true, priceCents: true } },
    },
  });

  const weekday = new Intl.DateTimeFormat('he-IL', { timeZone: SHOP_TIMEZONE, weekday: 'long' });
  const phone = (raw) => {
    const parsed = parsePhoneNumberFromString(String(raw ?? ''));
    return parsed?.isValid() ? parsed.formatNational() : raw ?? '';
  };

  return toCsv(
    [
      HEADER,
      ...appointments.map((a) => [
        asDate(a.startAt),
        weekday.format(a.startAt),
        asTime(a.startAt),
        a.client?.name,
        phone(a.client?.phone),
        a.client?.email,
        a.service?.name,
        a.service?.durationMin,
        a.service ? a.service.priceCents / 100 : '',
        STATUS[a.status] ?? a.status,
        SOURCE[a.source] ?? a.source ?? '',
        a.clientNote,
        asDate(a.createdAt),
      ]),
    ],
    { bom }
  );
}
