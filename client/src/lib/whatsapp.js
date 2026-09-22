/**
 * ===========================================================================
 *  WHATSAPP — click-to-chat, the free way
 * ===========================================================================
 *
 * No API, no Business account, no per-message fee. A wa.me link opens the
 * barber's own WhatsApp with the chat and the text already written, and the
 * barber presses send. That single human tap is what makes it free — and why
 * the server can never do it on its own.
 *
 * Two rules the format imposes:
 *   1. The number is international digits only: +972 50-123-4567 → 972501234567.
 *   2. WhatsApp sets a bubble's direction from its FIRST strong character. A
 *      message that opens with a Latin name ("Moshe, …") becomes an LTR bubble
 *      with the Hebrew pushed around it — so every message opens with a Hebrew
 *      word.
 *
 * `*text*` is WhatsApp's own bold. The admin preview renders it the same way.
 */
import { formatClock, formatDay, SHOP_TZ } from './bidi.jsx';

const ISRAEL = '972';

/** "+972 50-123-4567" · "050-1234567" · "00972…" → "972501234567", or null. */
export function waNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = ISRAEL + digits.slice(1);
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function waLink(phone, text = '') {
  const number = waNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** "ב־Luxe Barber" but "בלוקסי": the maqaf belongs only before a non-Hebrew word. */
export const prefixed = (letter, word = '') => {
  const w = String(word).trim();
  return /^[\u05D0-\u05EA]/.test(w) ? `${letter}${w}` : `${letter}־${w}`;
};

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';

const shekels = (cents) => {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(cents / 100)
    .replace(/[\u200e\u200f]/g, '');
};

/** "היום" · "מחר" · "ביום שלישי, 22 בספטמבר" — in the SHOP's timezone. */
export function whenPhrase(at, tz = SHOP_TZ) {
  const key = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
  const today = key(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const target = key(new Date(at));
  if (target === today) return 'היום';
  if (target === tomorrow) return 'מחר';
  return `ב${formatDay(at, tz)}`;
}

const hello = (name) => ['שלום', firstName(name), '💈'].filter(Boolean).join(' ');
const atShop = (shop) => (shop?.name ? ` ${prefixed('ב', shop.name)}` : '');

export function confirmationText({ client, service, startAt, shop, tz = SHOP_TZ }) {
  return [
    hello(client?.name),
    `התור שלך${atShop(shop)} נקבע:`,
    `*${formatDay(startAt, tz)} · ${formatClock(startAt, tz)}*`,
    [service?.name, Number.isFinite(service?.priceCents) ? shekels(service.priceCents) : null, 'מזומן במקום']
      .filter(Boolean)
      .join(' · '),
    shop?.address ? `📍 ${shop.address}` : null,
    'לשינוי או ביטול — אפשר לענות כאן.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function reminderText({ client, service, startAt, shop, tz = SHOP_TZ }) {
  return [
    hello(client?.name),
    `תזכורת לתור שלך ${whenPhrase(startAt, tz)} ב־${formatClock(startAt, tz)}${atShop(shop)}.`,
    service?.name ? `*${service.name}*` : null,
    shop?.address ? `📍 ${shop.address}` : null,
    'נתראה!',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The waitlist offer, with the same confirm link the email carries. */
export function offerText({ client, service, slotStartAt, expiresAt, token, shop, tz = SHOP_TZ }) {
  return [
    hello(client?.name),
    `התפנה תור בשבילך${atShop(shop)}:`,
    `*${formatDay(slotStartAt, tz)} · ${formatClock(slotStartAt, tz)}*${service?.name ? ` — ${service.name}` : ''}`,
    expiresAt ? `התור שמור לך עד ${formatClock(expiresAt, tz)}. לאישור בלחיצה:` : 'לאישור בלחיצה:',
    `${window.location.origin}/o/${token}`,
  ].join('\n');
}

export function helloText({ client, shop, context }) {
  const from = shop?.name ? `, כאן ${shop.name}` : '';
  return [`שלום ${firstName(client?.name)}${from} 💈`, context].filter(Boolean).join('\n');
}
