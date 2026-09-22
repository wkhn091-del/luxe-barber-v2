/**
 * Shared formatters. Two rules, both load-bearing:
 *
 *   1. EVERY time is rendered in the SHOP's timezone, never the device's.
 *      Someone booking from a plane still needs the time they should walk
 *      through the door. `Asia/Jerusalem` is the fallback because the shop is
 *      in Tel Aviv — a stale `Europe/Paris` row would otherwise shift every
 *      displayed time by an hour.
 *   2. MONEY IS ALWAYS SHEKELS. `formatPrice` ignores any currency argument
 *      for the same reason `<Price>` in lib/bidi.jsx does: legacy seed rows
 *      still carry `currency: "EUR"`, and a faithful client would print € on
 *      an Israeli price list.
 */
const SHOP_TZ = 'Asia/Jerusalem';
export function formatSlot(iso, timezone = SHOP_TZ, locale = 'he-IL') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(d);
}

export function formatTime(iso, timezone = SHOP_TZ, locale = 'he-IL') {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

export function formatDay(iso, timezone = SHOP_TZ, locale = 'he-IL') {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
}

export const formatPrice = (cents) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
