/**
 * The shop's timezone — FORCED.
 *
 * The shop is in Israel. Barber.timezone came from the original starter with a
 * default of Europe/Paris — one hour behind Israel, summer and winter — and
 * every wall-clock time rendered from it came out an hour early: the email
 * body said 08:00 for a 09:00 appointment, while the calendar invite (which
 * carries the absolute instant) said 09:00.
 *
 * So everything a client reads — email bodies, the calendar invite, the "add
 * to calendar" link — is rendered in this zone, whatever the row says. The row
 * itself is corrected by migration 20260924090000_shop_timezone.
 */
export const SHOP_TIMEZONE = 'Asia/Jerusalem';
