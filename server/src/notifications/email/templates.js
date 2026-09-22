/**
 * ===========================================================================
 *  EMAIL TEMPLATES — Hebrew, RTL, one per outbox template
 * ===========================================================================
 *
 * Written, not translated: plural address (לכם), short sentences, and every
 * time and deadline ABSOLUTE — "שמור לכם עד 14:45", never "15 דקות". An email
 * cannot count down, and a relative window means nothing to someone who opens
 * the message nine minutes late.
 *
 * Each builder returns content only — tone, chip, title, ticket, actions — and
 * layout.js turns it into HTML and plain text. A new template is a new function
 * here and nothing else.
 *
 * `staleAfter` is the moment a message stops being true. The dispatcher drops
 * anything past it, so an SMTP outage can never deliver an offer after it
 * expired, or "נתראה ב־14:30" after 14:30.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { env } from '../../config/env.js';
import { buildIcsEvent, icsStamp } from '../../lib/ics.js';
import { SHOP_TIMEZONE } from '../../lib/timezone.js';
import { exportUrl } from '../../lib/exportLink.js';
import { unsubscribeUrl } from '../../lib/unsubscribe.js';
import { renderLayout, rich, ltr, auto } from './layout.js';

const CASH = 'מזומן במקום';

const appUrl = (path = '/') => `${env.PUBLIC_APP_URL.replace(/\/+$/, '')}${path}`;

function appHost() {
  try {
    return new URL(env.PUBLIC_APP_URL).hostname;
  } catch {
    return 'luxe-barber';
  }
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'שלום';

/** Header-safe: a name typed with a newline must not become a new header line. */
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/**
 * Shekels exactly as the site prints them, minus the RTL marks Intl inserts —
 * the ltr() isolate does that job, more reliably across mail clients.
 */
function shekels(cents) {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(cents / 100)
    .replace(/[\u200e\u200f]/g, '');
}

/** Everything is formatted in the SHOP's timezone, never the server's. */
function clockFor(timeZone) {
  const day = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
  const time = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  const key = new Intl.DateTimeFormat('en-CA', { timeZone }); // yyyy-MM-dd

  // Calendar arithmetic on the date string: "tomorrow" stays right on the 23-
  // and 25-hour days that adding 24h to a timestamp gets wrong.
  const nextDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  };

  return {
    day: (at) => day.format(new Date(at)),
    time: (at) => time.format(new Date(at)),
    /** "היום" · "מחר" · "ביום שלישי, 22 בספטמבר" — ready to follow a verb. */
    when(at) {
      const target = key.format(new Date(at));
      const today = key.format(new Date());
      if (target === today) return 'היום';
      if (target === nextDay(today)) return 'מחר';
      return `ב${day.format(new Date(at))}`;
    },
  };
}

function shopOf(barber) {
  const phone = barber?.phone ? parsePhoneNumberFromString(barber.phone, env.DEFAULT_COUNTRY_CODE) : null;
  const valid = Boolean(phone?.isValid());
  return {
    name: barber?.name?.trim() || env.MAIL_FROM_NAME || 'Luxe Barber',
    // Forced: the row may still say Europe/Paris, an hour behind (lib/timezone.js).
    timeZone: SHOP_TIMEZONE,
    address: barber?.addressLine?.trim() || null,
    phoneDisplay: valid ? phone.formatNational() : null, // "03-123-4567"
    phoneHref: valid ? phone.getURI() : null, // "tel:+97231234567"
    replyTo: barber?.email || null,
    instagram: barber?.instagramUrl || null,
    // The barber's own Waze link wins; otherwise one is built from the address.
    waze: barber?.wazeUrl || (barber?.addressLine?.trim() ? wazeUrl(barber.addressLine.trim()) : null),
    offerTtlMin: barber?.offerTtlMin ?? null,
  };
}

const wazeUrl = (address) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

function googleCalendarUrl({ title, start, end, location, details, timeZone }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    // Absolute UTC instants (never ambiguous) + the event's zone, so Google
    // files it as an Israel-time event and shows the same hour as the email.
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    ctz: timeZone,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const minutes = (n) => rich`${ltr(n)} דקות`;

function serviceRows(service) {
  if (!service) return [];
  return [
    ['שירות', service.name],
    service.durationMin ? ['משך', minutes(service.durationMin)] : null,
    Number.isFinite(service.priceCents) ? ['מחיר', ltr(shekels(service.priceCents))] : null,
  ];
}

const reachUs = (shop) =>
  shop.phoneDisplay ? rich`השיבו למייל הזה או התקשרו ${ltr(shop.phoneDisplay)}` : 'השיבו למייל הזה';

const REASON = {
  booking: 'קיבלתם את המייל כי קבעתם אצלנו תור.',
  waitlist: 'קיבלתם את המייל כי נרשמתם לרשימת ההמתנה שלנו.',
  flash: 'קיבלתם את המייל כי ביקשתם לשמוע על תורים שמתפנים ברגע האחרון.',
  admin: 'קיבלתם את המייל כהתראה מהמערכת של המספרה.',
};

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

/** The client's own page for this appointment (client/src/pages/ManagePage.jsx). */
const manageUrl = (appointment) => (appointment?.manageToken ? appUrl(`/b/${appointment.manageToken}`) : null);
const manageAction = (appointment) =>
  manageUrl(appointment) && { label: 'ביטול / ניהול תור', href: manageUrl(appointment), variant: 'outline' };

const TEMPLATES = {
  BOOKING_CONFIRMED({ client, barber, service, appointment }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    // The client's calendar gets the service length. endAt also carries the
    // shop's clean-up buffer, which is the barber's time, not theirs.
    const end = service?.durationMin
      ? new Date(start.getTime() + service.durationMin * 60_000)
      : new Date(appointment.endAt);
    const day = clock.day(start);
    const time = clock.time(start);
    const eventTitle = service?.name ? `${service.name} · ${shop.name}` : shop.name;
    const eventNote = `תשלום: ${CASH}.`;

    return {
      subject: `התור נקבע · ${day}, ${time}`,
      preheader: `נתראה ${clock.when(start)} ב־${time}. ${CASH}, בלי מקדמה.`,
      tone: 'mint',
      chip: 'התור נקבע',
      title: 'הכיסא שמור לכם',
      intro: rich`${auto(firstName(client.name))}, הכול סגור. נתראה ${clock.when(start)} ב־${ltr(time)}.`,
      ticket: {
        dateWords: day,
        time,
        rows: [...serviceRows(service), ['תשלום', CASH], shop.address && ['כתובת', shop.address]],
      },
      actions: [
        {
          label: 'הוספה ליומן',
          href: googleCalendarUrl({
            title: eventTitle,
            start,
            end,
            location: shop.address,
            details: eventNote,
            timeZone: shop.timeZone,
          }),
        },
        manageAction(appointment),
        shop.waze && { label: 'ניווט ב־Waze', href: shop.waze, variant: 'outline' },
      ],
      note: rich`לא מסתדר? בכפתור ״ביטול / ניהול תור״ מבטלים בלחיצה, והזמן עובר מיד למי שמחכה ברשימה. לשאלות: ${reachUs(shop)}.`,
      reason: REASON.booking,
      ics: buildIcsEvent({
        uid: `appointment-${appointment.id}@${appHost()}`,
        start,
        end,
        summary: eventTitle,
        location: shop.address,
        description: eventNote,
        timeZone: shop.timeZone,
        // Booked inside the last hour? A calendar alarm would fire the moment
        // it is added — the "reminder at booking" we never want.
        alarmMinutes: start.getTime() - Date.now() > 60 * 60_000 ? 60 : 0,
      }),
    };
  },

  WAITLIST_OFFER({ client, barber, service, offer, minutes: ttl }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(offer.slotStartAt);
    const day = clock.day(start);
    const time = clock.time(start);
    const deadline = clock.time(offer.expiresAt);
    const hold = ttl ?? shop.offerTtlMin;

    return {
      subject: `התפנה לכם תור · שמור עד ${deadline}`,
      preheader: `${day}, ${time}${service?.name ? ` · ${service.name}` : ''}. אישור בלחיצה אחת — אחרי ${deadline} התור עובר לבא ברשימה.`,
      tone: 'pomegranate',
      chip: 'התפנה תור',
      title: rich`${auto(firstName(client.name))}, התפנה כיסא`,
      intro: hold
        ? rich`מישהו ביטל, ואתם הבאים ברשימה. התור שמור לכם ל־${ltr(hold)} דקות בלבד.`
        : 'מישהו ביטל, ואתם הבאים ברשימה.',
      ticket: { dateWords: day, time, rows: [...serviceRows(service), ['תשלום', CASH]] },
      callout: { title: rich`שמור לכם עד ${ltr(deadline)}`, body: 'אחר כך הוא עובר אוטומטית לבא ברשימה.' },
      actions: [{ label: 'לאשר את התור', href: appUrl(`/o/${offer.token}`) }],
      secondary: {
        label: 'לא מתאים הפעם? לוותר עליו ולשמור על המקום ברשימה',
        href: appUrl(`/o/${offer.token}?decline=1`),
      },
      note: 'הקישור אישי. לחיצה על ״לאשר את התור״ קובעת אותו מיד — אין צורך להשיב למייל.',
      reason: REASON.waitlist,
      staleAfter: offer.expiresAt,
    };
  },

  WAITLIST_OFFER_EXPIRED({ client, barber, offer }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(offer.slotStartAt);

    return {
      subject: 'התור עבר הלאה · אתם עדיין ברשימה',
      preheader: 'המקום שלכם ברשימה נשמר. נכתוב ברגע שיתפנה תור נוסף.',
      tone: 'azure',
      chip: 'עדכון מרשימת ההמתנה',
      title: 'הפעם זה לא הסתדר',
      intro: rich`${auto(firstName(client.name))}, התור של ${clock.day(start)} ב־${ltr(clock.time(start))} עבר לבא ברשימה, כי לא אושר בזמן.`,
      callout: { title: 'אתם עדיין ברשימה', body: 'המקום שלכם נשמר. כשיתפנה תור נוסף שמתאים לכם — נכתוב שוב.' },
      reason: REASON.waitlist,
    };
  },

  WAITLIST_JOINED({ client, barber, service, position }) {
    const shop = shopOf(barber);
    const hold = shop.offerTtlMin;

    return {
      subject: `נרשמתם לרשימת ההמתנה · מקום ${position}`,
      preheader: 'כשיתפנה תור שמתאים לכם, נשלח מייל עם קישור לאישור בלחיצה אחת.',
      tone: 'azure',
      chip: 'רשימת המתנה',
      title: rich`אתם במקום ${ltr(position)}`,
      intro: rich`${auto(firstName(client.name))}, נרשמתם לרשימת ההמתנה. ברגע שיתפנה תור שמתאים לכם — נכתוב.`,
      ticket: { rows: [service && ['שירות', service.name], ['מקום ברשימה', ltr(position)]] },
      callout: {
        tone: 'citrus',
        title: 'כדאי לדעת',
        body: hold
          ? rich`ההצעה נשמרת לכם ${ltr(hold)} דקות בלבד, ואז עוברת לבא ברשימה. הפעילו התראות למייל הזה בטלפון.`
          : 'ההצעה נשמרת לכם לזמן קצר בלבד, ואז עוברת לבא ברשימה. הפעילו התראות למייל הזה בטלפון.',
      },
      reason: REASON.waitlist,
    };
  },

  REMINDER_24H({ client, barber, service, appointment }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    const when = clock.when(start);
    const time = clock.time(start);
    const near = when === 'מחר' || when === 'היום';

    return {
      subject: `${near ? when : clock.day(start)} ב־${time} · תזכורת לתור`,
      preheader: `${service?.name ? `${service.name} · ` : ''}${CASH}.`,
      tone: 'citrus',
      chip: 'תזכורת',
      title: near ? `נתראה ${when}` : 'נתראה בקרוב',
      intro: rich`${auto(firstName(client.name))}, רק מזכירים — ${when} ב־${ltr(time)}.`,
      ticket: {
        dateWords: clock.day(start),
        time,
        rows: [service && ['שירות', service.name], ['תשלום', CASH], shop.address && ['כתובת', shop.address]],
      },
      actions: [shop.waze && { label: 'ניווט ב־Waze', href: shop.waze }, manageAction(appointment)],
      note: rich`לא מסתדר? בכפתור ״ביטול / ניהול תור״ מבטלים בלחיצה, והזמן עובר למי שמחכה. לשאלות: ${reachUs(shop)}.`,
      reason: REASON.booking,
      staleAfter: appointment.startAt,
    };
  },

  REMINDER_1H({ client, barber, service, appointment }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    const time = clock.time(start);

    return {
      subject: `נתראה ב־${time}`,
      preheader: `הכיסא מוכן. ${CASH}.`,
      tone: 'citrus',
      chip: 'עוד מעט',
      title: rich`נתראה ב־${ltr(time)}`,
      intro: rich`${auto(firstName(client.name))}, הכיסא מוכן. התשלום במזומן במקום.`,
      ticket: { rows: [service && ['שירות', service.name], shop.address && ['כתובת', shop.address]] },
      actions: [shop.waze && { label: 'ניווט ב־Waze', href: shop.waze }, manageAction(appointment)],
      reason: REASON.booking,
      staleAfter: appointment.startAt,
    };
  },

  /**
   * To the BARBER, not a client: someone just booked. Who, what and when at a
   * glance between cuts, one tap to the admin or to the client's WhatsApp, and
   * the booking as a calendar invite. Never sent for bookings he made himself.
   */
  ADMIN_NEW_BOOKING({ client, barber, service, appointment, via }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    const end = service?.durationMin
      ? new Date(start.getTime() + service.durationMin * 60_000)
      : new Date(appointment.endAt);
    const day = clock.day(start);
    const time = clock.time(start);
    const phone = parsePhoneNumberFromString(String(client.phone ?? ''));
    const phoneLine = phone?.isValid() ? phone.formatNational() : client.phone || null;
    const digits = String(client.phone ?? '').replace(/\D/g, '');
    const source = via === 'WAITLIST' ? 'מרשימת ההמתנה' : 'דרך האתר';

    return {
      subject: `תור חדש: ${client.name} · ${day}, ${time}`,
      preheader: [service?.name, `${day} ב־${time}`].filter(Boolean).join(' · '),
      tone: 'mint',
      chip: 'תור חדש',
      title: 'נקבע תור חדש',
      // Gender-neutral on purpose: the sentence is about the appointment, not the client.
      intro: rich`${auto(client.name)} — ${clock.when(start)} ב־${ltr(time)}. התור נקבע ${source}.`,
      ticket: {
        dateWords: day,
        time,
        rows: [
          ['לקוח', client.name],
          phoneLine && ['טלפון', ltr(phoneLine)],
          client.email && ['מייל', ltr(client.email)],
          ...serviceRows(service),
          appointment.clientNote && ['הערה', appointment.clientNote],
        ],
      },
      actions: [
        { label: 'פתיחה בניהול', href: appUrl('/admin') },
        digits && { label: 'וואטסאפ ללקוח', href: `https://wa.me/${digits}`, variant: 'outline' },
        // Downloads directly — the link carries its own 7-day authorisation.
        barber?.id && { label: 'הורד דוח תורים לאקסל', href: exportUrl(barber.id, '7d'), variant: 'outline' },
      ],
      note: rich`המייל הזה נשלח רק אליכם — הלקוח קיבל אישור משלו.`,
      reason: REASON.admin,
      ics: buildIcsEvent({
        uid: `appointment-${appointment.id}-shop@${appHost()}`,
        start,
        end,
        summary: [client.name, service?.name].filter(Boolean).join(' · '),
        location: shop.address,
        description: [phoneLine && `טלפון: ${phoneLine}`, appointment.clientNote].filter(Boolean).join('\n'),
        timeZone: shop.timeZone,
      }),
    };
  },

  /** To the BARBER: a client cancelled from their manage link. The freed time matters to him. */
  ADMIN_APPOINTMENT_CANCELLED({ client, barber, service, appointment }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    const day = clock.day(start);
    const time = clock.time(start);
    const phone = parsePhoneNumberFromString(String(client.phone ?? ''));
    const phoneLine = phone?.isValid() ? phone.formatNational() : client.phone || null;
    const digits = String(client.phone ?? '').replace(/\D/g, '');

    return {
      subject: `ביטול: ${client.name} · ${day}, ${time}`,
      preheader: 'הזמן חזר ליומן.',
      tone: 'grape',
      chip: 'ביטול',
      title: 'לקוח ביטל תור',
      intro: rich`${auto(client.name)} — ${day} ב־${ltr(time)}. התור בוטל מהקישור שבאישור.`,
      ticket: {
        dateWords: day,
        time,
        rows: [['לקוח', client.name], phoneLine && ['טלפון', ltr(phoneLine)], ...serviceRows(service)],
      },
      actions: [
        { label: 'פתיחה בניהול', href: appUrl('/admin') },
        digits && { label: 'וואטסאפ ללקוח', href: `https://wa.me/${digits}`, variant: 'outline' },
      ],
      note: rich`הזמן חזר ליומן, והמערכת מציעה אותו אוטומטית לרשימת ההמתנה אם יש בה מישהו מתאים.`,
      reason: REASON.admin,
    };
  },

  APPOINTMENT_CANCELLED({ client, barber, appointment }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(appointment.startAt);
    const day = clock.day(start);
    const time = clock.time(start);

    return {
      subject: `התור בוטל · ${day}, ${time}`,
      preheader: 'רוצים מועד אחר? היומן פתוח באתר.',
      tone: 'grape',
      chip: 'ביטול',
      title: 'התור בוטל',
      intro: rich`${auto(firstName(client.name))}, התור של ${day} ב־${ltr(time)} בוטל.`,
      actions: [{ label: 'לקביעת תור חדש', href: appUrl('/') }],
      note: rich`חושבים שזו טעות? ${reachUs(shop)}.`,
      reason: REASON.booking,
    };
  },

  FLASH_SLOT({ client, barber, broadcast }) {
    const shop = shopOf(barber);
    const clock = clockFor(shop.timeZone);
    const start = new Date(broadcast.slotStartAt);
    const when = clock.when(start);
    const time = clock.time(start);

    return {
      subject: `התפנה תור ${when} ב־${time}`,
      preheader: 'מי שקובע ראשון — מקבל. לא שומרים, לא מחכים.',
      tone: 'pomegranate',
      chip: 'הרגע האחרון',
      title: rich`התפנה תור ${when}`,
      intro: rich`${auto(firstName(client.name))}, התפנה כיסא ${when} ב־${ltr(time)}. מי שקובע ראשון — מקבל.`,
      ticket: { dateWords: clock.day(start), time, rows: [] },
      callout: broadcast.message ? { tone: 'citrus', body: rich`״${broadcast.message}״` } : null,
      actions: [{ label: 'לקביעת התור', href: appUrl('/') }],
      reason: REASON.flash,
      // Marketing: the opt-out the anti-spam law requires, in every one.
      unsubscribe: client?.id ? unsubscribeUrl(client.id) : null,
      staleAfter: broadcast.slotStartAt,
    };
  },
};

export const hasEmailTemplate = (template) => Object.hasOwn(TEMPLATES, template);

/**
 * @returns {{ subject, html, text, ics, staleAfter, fromName, replyTo }}
 *          — JSON-safe, stored as the outbox payload
 */
export function renderEmail(template, data) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`No email template for ${template}`);

  const shop = shopOf(data.barber);
  const message = build(data);
  const subject = oneLine(message.subject);
  const { html, text } = renderLayout({ ...message, subject, shop });

  return {
    subject,
    html,
    text,
    ics: message.ics ?? null,
    staleAfter: message.staleAfter ? new Date(message.staleAfter).toISOString() : null,
    fromName: shop.name,
    replyTo: shop.replyTo,
  };
}
