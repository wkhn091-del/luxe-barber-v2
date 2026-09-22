/**
 * ===========================================================================
 *  TIMELINE MATHS
 * ===========================================================================
 *
 * A small mirror of the server's availability engine, used ONLY to draw the
 * barber's day. The server stays authoritative for anything that writes: this
 * exists so the timeline can show gaps without a round-trip per hour.
 *
 * No date library. Luxon is 70 KB and this needs exactly one thing from it —
 * "what UTC instant is local midnight in Europe/Paris on this date" — which
 * Intl already knows. On a tool the barber opens between cuts on 4G, 70 KB is
 * a real cost and two functions is not.
 */

/**
 * Minutes a zone is offset from UTC at a given instant.
 * Formats the instant in the target zone, reads the wall-clock back as if it
 * were UTC, and takes the difference. DST-correct by construction, because
 * Intl already applies the right rule for that date.
 */
function zoneOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

/**
 * Resolve a local wall-clock time on a local date to the UTC instant.
 *
 * Two passes, and the second one is not optional. The obvious implementation —
 * find local midnight, then add N minutes — is wrong on exactly two days a
 * year. On 29 March 2026 Paris jumps 02:00 to 03:00, so "midnight plus 540
 * minutes" lands at 10:00 local, not the 09:00 the barber typed into their
 * opening hours. Solving for the instant whose wall clock IS 09:00 gets it
 * right on every date.
 */
export function wallClockToUtc(dateISO, minutes, timeZone) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const wall = Date.UTC(y, m - 1, d, 0, minutes % 60) + hour * 3600_000;

  // Guess with the offset at the naive instant, then re-solve with the offset
  // at the guess. Converges for every real zone rule.
  const first = new Date(wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60_000);
  return new Date(wall - zoneOffsetMinutes(first, timeZone) * 60_000);
}

/** The UTC instant of 00:00 local on `dateISO` (yyyy-MM-dd). */
export const localMidnight = (dateISO, timeZone) => wallClockToUtc(dateISO, 0, timeZone);

/** Local minutes-from-midnight → UTC Date. */
export const minutesToDate = (dateISO, minutes, timeZone) =>
  wallClockToUtc(dateISO, minutes, timeZone);

/** ISO weekday (1 = Monday) of a local date string. */
export function isoWeekday(dateISO) {
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const todayISO = (timeZone) =>
  // en-CA is used purely because it formats as yyyy-MM-dd; nothing here is
  // shown to a person, it is a map key.
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

// --- Interval algebra (same shape as the server's) -------------------------

export function mergeIntervals(list) {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = new Date(cur.end);
    } else {
      out.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return out;
}

export function subtractIntervals(base, cuts) {
  let result = mergeIntervals(base);
  for (const cut of mergeIntervals(cuts)) {
    const next = [];
    for (const iv of result) {
      if (cut.end <= iv.start || cut.start >= iv.end) {
        next.push(iv);
        continue;
      }
      if (cut.start > iv.start) next.push({ start: iv.start, end: new Date(cut.start) });
      if (cut.end < iv.end) next.push({ start: new Date(cut.end), end: iv.end });
    }
    result = next;
  }
  return result;
}

/**
 * Build the rows the timeline renders.
 *
 * The output interleaves appointments and gaps in time order, because in a
 * barber's day the EMPTY space is the actionable thing. Most admin calendars
 * render bookings and leave the holes as background; here a hole is a row with
 * its own affordance, which is what makes "flash this gap" a one-tap action
 * instead of a form.
 *
 * @returns {Array<{kind:'appointment'|'gap', start:Date, end:Date, minutes:number, appointment?:object}>}
 */
export function buildTimeline({
  dateISO,
  timeZone,
  rules = [],
  exceptions = [],
  appointments = [],
  minGapMinutes = 20,
}) {
  const weekday = isoWeekday(dateISO);

  const open = rules
    .filter((r) => r.weekday === weekday && r.active !== false)
    .map((r) => ({
      start: minutesToDate(dateISO, r.startMinute, timeZone),
      end: minutesToDate(dateISO, r.endMinute, timeZone),
    }));

  for (const ex of exceptions) {
    if (ex.kind === 'OPEN') open.push({ start: new Date(ex.startAt), end: new Date(ex.endAt) });
  }

  const blocks = exceptions
    .filter((ex) => ex.kind === 'BLOCK')
    .map((ex) => ({ start: new Date(ex.startAt), end: new Date(ex.endAt), blockId: ex.id }));

  const booked = appointments
    .filter((a) => ['HELD', 'PENDING', 'CONFIRMED', 'COMPLETED'].includes(a.status))
    .map((a) => ({ start: new Date(a.startAt), end: new Date(a.endAt) }));

  const free = subtractIntervals(subtractIntervals(open, blocks), booked);

  const rows = [
    ...appointments.map((a) => ({
      kind: 'appointment',
      start: new Date(a.startAt),
      end: new Date(a.endAt),
      appointment: a,
    })),
    ...blocks.map((b) => ({ kind: 'block', start: b.start, end: b.end, blockId: b.blockId })),
    // Turnaround slivers between back-to-back cuts aren't openings; showing
    // them as actionable gaps would bury the two real ones.
    ...free
      .filter((iv) => (iv.end - iv.start) / 60_000 >= minGapMinutes)
      .map((iv) => ({ kind: 'gap', start: iv.start, end: iv.end })),
  ].sort((a, b) => a.start - b.start);

  return rows.map((r) => ({ ...r, minutes: Math.round((r.end - r.start) / 60_000) }));
}

/**
 * "45 דק׳", "3 שע׳", "3 שע׳ 10 דק׳"
 *
 * Hebrew abbreviates with a geresh (׳), not a full stop, and there is no
 * plural-vs-singular form to worry about at these lengths. The NUMERALS still
 * have to be isolated by the caller — `durationLabel` returns a string, so the
 * components wrap it or build it from <Num> themselves.
 */
export function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} דק׳`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} שע׳ ${m} דק׳` : `${h} שע׳`;
}
