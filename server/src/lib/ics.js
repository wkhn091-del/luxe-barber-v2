/**
 * ===========================================================================
 *  ICS — "add to calendar" without a dependency
 * ===========================================================================
 *
 * A confirmation that can drop itself into the client's calendar is the
 * cheapest no-show reduction there is. The format is small, but two details in
 * it are routinely got wrong — and both break Hebrew specifically:
 *
 *   1. ESCAPING. `\`, `;` and `,` are syntax inside a value, so
 *      "הרצל 5, תל אביב" ends the LOCATION field at the comma unless escaped.
 *   2. FOLDING IS BY OCTETS. Lines over 75 bytes must wrap, and a Hebrew letter
 *      is two bytes in UTF-8. Folding by string length cuts letters in half,
 *      and Outlook renders the halves as mojibake.
 *   3. THE TIME ZONE IS SPELLED OUT. Start and end are written as Israel
 *      wall-clock time with TZID=Asia/Jerusalem, and the zone's own rules
 *      (the VTIMEZONE below) travel with it. Google and Apple read the zone by
 *      name, Outlook by the rules — so every calendar shows exactly the hour
 *      the email body prints, and a client abroad still sees it converted.
 */
import { DateTime } from 'luxon';
import { SHOP_TIMEZONE } from './timezone.js';

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** 2026-09-22T11:30:00.000Z → 20260922T113000Z */
export const icsStamp = (date) =>
  new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** 2026-09-23T06:00:00Z in Asia/Jerusalem → 20260923T090000 (wall-clock, no Z) */
export const icsLocal = (date, timeZone = SHOP_TIMEZONE) =>
  DateTime.fromJSDate(new Date(date), { zone: timeZone }).toFormat("yyyyMMdd'T'HHmmss");

/**
 * Israel's rules since 2013: summer time from 02:00 on the Friday before the
 * last Sunday of March (always a Friday between the 23rd and the 29th), back
 * to standard time at 02:00 on the last Sunday of October. Verified against
 * the IANA database for 2025–2040 (see the test in the repo history).
 */
const VTIMEZONES = {
  'Asia/Jerusalem': [
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Jerusalem',
    'X-LIC-LOCATION:Asia/Jerusalem',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0300',
    'TZNAME:IDT',
    'DTSTART:19700327T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0200',
    'TZNAME:IST',
    'DTSTART:19701025T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
};

const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

export function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) return line;

  const out = [];
  let chunk = '';
  let size = 0;
  let limit = MAX_OCTETS;

  // for…of walks code points, so a letter (or an emoji) is never split.
  for (const char of line) {
    const bytes = Buffer.byteLength(char, 'utf8');
    if (size + bytes > limit) {
      out.push(chunk);
      chunk = '';
      size = 0;
      limit = MAX_OCTETS - 1; // a continuation line spends one octet on its leading space
    }
    chunk += char;
    size += bytes;
  }
  out.push(chunk);
  return out.join(`${CRLF} `);
}

/** One VEVENT's lines; `when` writes a date in the calendar's zone. */
function eventLines({ uid, start, end, summary, location, description, status = 'CONFIRMED', alarmMinutes = 0 }, when) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    when('DTSTART', start),
    when('DTEND', end),
    `SUMMARY:${escapeText(summary)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
    ...(alarmMinutes > 0
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-PT${Math.round(alarmMinutes)}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
  ];
}

/**
 * A whole calendar: one event for an email invite, every appointment for the
 * barber's subscription feed.
 *
 * @param {object}   calendar
 * @param {object[]} calendar.events           { uid, start, end, summary, location?, description?, status?, alarmMinutes? }
 * @param {string}   [calendar.name]           what the calendar app calls it (X-WR-CALNAME)
 * @param {number}   [calendar.refreshMinutes] a refresh hint for subscribers (Apple honours it; Google polls on its own)
 * @param {string}   [calendar.timeZone]       defaults to the shop's (forced) zone
 */
export function buildIcsCalendar({ events, name, refreshMinutes, timeZone = SHOP_TIMEZONE, prodId = '-//Luxe Barber//Bookings//HE' }) {
  // A zone we carry the rules for is written as wall-clock time + TZID. Any
  // other zone falls back to UTC instants, which are never ambiguous.
  const rules = VTIMEZONES[timeZone];
  const when = (field, date) => (rules ? `${field};TZID=${timeZone}:${icsLocal(date, timeZone)}` : `${field}:${icsStamp(date)}`);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    name ? `X-WR-CALNAME:${escapeText(name)}` : null,
    ...(refreshMinutes ? [`REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMinutes}M`, `X-PUBLISHED-TTL:PT${refreshMinutes}M`] : []),
    ...(rules ? [`X-WR-TIMEZONE:${timeZone}`, ...rules] : []),
    ...events.flatMap((event) => eventLines(event, when)),
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * The single-event invite attached to confirmation emails.
 * @param {object} event  { uid, start, end, summary, location?, description?,
 *                          alarmMinutes? (default 60, 0 for none), timeZone?, prodId? }
 */
export function buildIcsEvent({ alarmMinutes = 60, timeZone, prodId, ...event }) {
  return buildIcsCalendar({ events: [{ ...event, alarmMinutes }], timeZone, prodId });
}
