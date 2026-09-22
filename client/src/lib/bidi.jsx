/**
 * ===========================================================================
 *  BIDI ISOLATION + ISRAELI MONEY
 * ===========================================================================
 *
 * Bidi is the single most common bug in Hebrew interfaces, and it is invisible
 * to anyone testing in English.
 *
 * The Unicode bidi algorithm resolves runs of NEUTRAL characters — digits,
 * colons, hyphens, currency signs — according to the surrounding paragraph
 * direction. Inside an RTL paragraph, "09:00 – 19:00" is one neutral run, so it
 * is laid out right-to-left and the user reads "19:00 – 09:00". The DOM is
 * correct. The screen is wrong.
 *
 * `<bdi dir="ltr">` opens an isolate and forces LTR resolution inside it. Every
 * numeral, price, time and range in this app goes through one of these.
 */

const SHEKEL = 'ILS';

export const Num = ({ children, className = '' }) => (
  <bdi dir="ltr" className={`figures ${className}`}>
    {children}
  </bdi>
);

/** "09:00 – 19:00", "45–60". The isolate wraps the WHOLE pair, because the
 *  separator is exactly where the reordering bites. */
export const Range = ({ from, to, sep = '–', className = '' }) => (
  <bdi dir="ltr" className={`figures ${className}`}>
    {from}
    <span aria-hidden="true">{` ${sep} `}</span>
    {to}
  </bdi>
);

/**
 * Money, always in shekels.
 *
 * The `currency` argument is deliberately IGNORED. The seed data still carries
 * `currency: "EUR"` from the original build, and a client that faithfully
 * renders whatever the API says would print € on an Israeli price list. Forcing
 * ILS here means a stale row cannot leak the wrong symbol onto the page.
 *
 * The real fix is the data — see `server/prisma/seed.js`, which now writes ILS
 * — but this stays as the guard, because a currency symbol is not something you
 * want to get wrong twice.
 */
/**
 * Free text with times in it — the barber's own "שלישי – שבת, 09:00 - 19:00".
 *
 * <Range> handles times we format ourselves; this handles times somebody
 * TYPED, with whatever dash and spacing they like. Every run of digits and
 * separators — "09:00 - 19:00", "08:30–14:00", "9-19", even a phone number —
 * becomes one LTR isolate (see the note at the top), so no range can ever read
 * backwards. The Hebrew around it is left exactly as written.
 */
const NUMERIC_RUN = /(\d+(?:[:.]\d+)*(?:\s*[-–—]\s*\d+(?:[:.]\d+)*)*)/g;

export function TimesText({ text, className = '' }) {
  const parts = String(text ?? '').split(NUMERIC_RUN);
  return (
    <span className={className}>
      {parts.map((part, i) => (i % 2 ? <Num key={i}>{part}</Num> : part))}
    </span>
  );
}

export function Price({ cents, className = '', sign = true }) {
  const text = new Intl.NumberFormat('he-IL', {
    style: sign ? 'currency' : 'decimal',
    currency: SHEKEL,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

  return (
    <bdi dir="ltr" className={`figures ${className}`}>
      {text}
    </bdi>
  );
}

/** "45 דקות" — the figure is isolated, the Hebrew noun is not. */
export const Minutes = ({ value, className = '' }) => (
  <span className={className}>
    <Num>{value}</Num> דקות
  </span>
);

/**
 * All dates and times in the client are rendered in the SHOP's timezone, never
 * the device's — someone booking from a plane still needs the time they should
 * walk through the door.
 *
 * Asia/Jerusalem is the fallback because the shop is in Tel Aviv; the API's
 * value wins when present.
 */
export const SHOP_TZ = 'Asia/Jerusalem';

export function formatDay(iso, tz = SHOP_TZ) {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatClock(iso, tz = SHOP_TZ) {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(new Date(iso));
}

/**
 * "יום חמישי, 21 במאי, 15:00"
 *
 * The date words carry a single lone number, which is bidi-safe on its own. The
 * time carries a colon BETWEEN two numbers, which is not — so it gets its own
 * isolate. Formatting the whole thing in one Intl call and hoping is how a page
 * ends up telling someone to arrive at 00:15.
 */
export function SlotTime({ iso, tz = SHOP_TZ, className = '' }) {
  return (
    <span className={className}>
      {formatDay(iso, tz)}, <Num>{formatClock(iso, tz)}</Num>
    </span>
  );
}

/** Hebrew weekday initials, Sunday-first — the Israeli week. */
export const HE_WEEKDAYS = [
  { iso: 7, short: 'א', full: 'ראשון' },
  { iso: 1, short: 'ב', full: 'שני' },
  { iso: 2, short: 'ג', full: 'שלישי' },
  { iso: 3, short: 'ד', full: 'רביעי' },
  { iso: 4, short: 'ה', full: 'חמישי' },
  { iso: 5, short: 'ו', full: 'שישי' },
  { iso: 6, short: 'ש', full: 'שבת' },
];

/**
 * The four service accents, assigned by index.
 *
 * Stable by position, so a service keeps its colour between visits and the menu
 * becomes scannable by hue rather than by reading. This is the single idea that
 * makes the page colourful AND the menu clearer at the same time.
 */
export const SERVICE_THEMES = [
  { key: 'pomegranate', bar: 'bg-pomegranate', text: 'text-pomegranate-deep', soft: 'bg-pomegranate-soft', ring: 'ring-pomegranate', btn: 'bg-pomegranate hover:bg-pomegranate-deep', border: 'border-pomegranate' },
  { key: 'azure', bar: 'bg-azure', text: 'text-azure-deep', soft: 'bg-azure-soft', ring: 'ring-azure', btn: 'bg-azure hover:bg-azure-deep', border: 'border-azure' },
  { key: 'citrus', bar: 'bg-citrus', text: 'text-citrus-deep', soft: 'bg-citrus-soft', ring: 'ring-citrus', btn: 'bg-citrus hover:bg-citrus-deep', border: 'border-citrus' },
  { key: 'mint', bar: 'bg-mint', text: 'text-mint-deep', soft: 'bg-mint-soft', ring: 'ring-mint', btn: 'bg-mint hover:bg-mint-deep', border: 'border-mint' },
];

export const themeFor = (index) => SERVICE_THEMES[index % SERVICE_THEMES.length];
