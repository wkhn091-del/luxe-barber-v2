/**
 * Timezone + interval helpers.
 *
 * Rules of the house:
 *   1. Every instant stored or returned by the API is UTC.
 *   2. Every *rule* the barber writes is local wall-clock ("I open at 09:00").
 *   3. Conversion happens here, per-date, so DST transitions never shift hours.
 */
import { DateTime } from 'luxon';

/**
 * Convert local minutes-from-midnight on a local date into a UTC Date.
 *
 * `.set()`, not `.plus()`. Adding 540 minutes to local midnight is exact-time
 * arithmetic, so on 29 March 2026 — when Paris jumps 02:00 to 03:00 — it lands
 * at 10:00 local rather than the 09:00 the barber actually typed into their
 * opening hours. Setting the wall-clock time is DST-safe on every date.
 */
export function localMinutesToUtc(localDateISO, minutes, timezone) {
  const base = DateTime.fromISO(localDateISO, { zone: timezone }).startOf('day');
  const hour = Math.floor(minutes / 60);

  // endMinute is allowed to be 1440 (midnight at the end of the day), which is
  // not a valid hour to set — roll into the next day instead.
  const dt =
    hour >= 24
      ? base.plus({ days: 1 }).startOf('day').plus({ minutes: minutes % 60 })
      : base.set({ hour, minute: minutes % 60, second: 0, millisecond: 0 });

  return dt.toUTC().toJSDate();
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an instant, in the shop's timezone. */
export function localWeekday(date, timezone) {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone).weekday;
}

/** Local 'yyyy-MM-dd' of an instant. */
export function localDateKey(date, timezone) {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone).toISODate();
}

/** Local minutes-from-midnight of an instant. */
export function localMinuteOfDay(date, timezone) {
  const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone);
  return dt.hour * 60 + dt.minute;
}

/** Human label for messages: "Thursday 14 May, 15:00". */
export function formatLocal(date, timezone, locale = 'fr') {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timezone)
    .setLocale(locale)
    .toFormat("cccc d LLLL, HH:mm");
}

/** Inclusive list of local date keys covering [from, to]. */
export function eachLocalDate(from, to, timezone) {
  const out = [];
  let cursor = DateTime.fromJSDate(from, { zone: 'utc' }).setZone(timezone).startOf('day');
  const last = DateTime.fromJSDate(to, { zone: 'utc' }).setZone(timezone).startOf('day');
  while (cursor <= last) {
    out.push({ iso: cursor.toISODate(), weekday: cursor.weekday });
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Interval algebra. Intervals are { start: Date, end: Date }, half-open [start, end).
// ---------------------------------------------------------------------------

/** Sort by start, then merge anything touching or overlapping. */
export function mergeIntervals(intervals) {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/** base \ blocks — everything in `base` not covered by any block. */
export function subtractIntervals(base, blocks) {
  const cuts = mergeIntervals(blocks);
  let result = mergeIntervals(base);

  for (const cut of cuts) {
    const next = [];
    for (const iv of result) {
      // Disjoint → keep whole.
      if (cut.end <= iv.start || cut.start >= iv.end) {
        next.push(iv);
        continue;
      }
      // Left remainder.
      if (cut.start > iv.start) next.push({ start: iv.start, end: new Date(cut.start) });
      // Right remainder.
      if (cut.end < iv.end) next.push({ start: new Date(cut.end), end: iv.end });
      // Fully covered → drop.
    }
    result = next;
  }
  return result;
}

/** Round an instant UP to the next slot boundary in local time. */
export function ceilToGranularity(date, granularityMin, timezone) {
  const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone);
  const remainder = (dt.hour * 60 + dt.minute) % granularityMin;
  const bumped =
    remainder === 0 && dt.second === 0 && dt.millisecond === 0
      ? dt
      : dt.plus({ minutes: granularityMin - remainder }).startOf('minute');
  return bumped.toUTC().toJSDate();
}

export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
export const minutesBetween = (a, b) => (b.getTime() - a.getTime()) / 60_000;
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Bucket a local minute-of-day into the waitlist's TimePreference enum. */
export function timePreferenceOf(date, timezone) {
  const m = localMinuteOfDay(date, timezone);
  if (m < 12 * 60) return 'MORNING';
  if (m < 17 * 60) return 'AFTERNOON';
  return 'EVENING';
}

/** Does an ISO weekday (1-7) pass a waitlist bitmask? bit 0 = Monday. */
export function weekdayMatchesMask(isoWeekday, mask) {
  return (mask & (1 << (isoWeekday - 1))) !== 0;
}
