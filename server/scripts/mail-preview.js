/**
 * Every email template, rendered with sample data. No database needed.
 *
 *   npm run mail:preview
 *       → writes .mail-preview/*.html (browser), *.eml (Apple Mail / Outlook),
 *         *.txt and *.ics — judge the design before a client ever sees it
 *
 *   npm run mail:preview -- --to you@gmail.com
 *       → SENDS the booking confirmation and the waitlist offer through the SMTP
 *         settings in .env: the end-to-end check that the App Password works
 */
const flagAt = process.argv.indexOf('--to');
const sendTo = flagAt > -1 ? process.argv[flagAt + 1] : null;

// Before env.js loads: dotenv never overrides a variable that is already set.
if (!sendTo) process.env.MAIL_TRANSPORT = 'preview';

const { env } = await import('../src/config/env.js');
const { renderEmail } = await import('../src/notifications/email/templates.js');
const { sendEmail, verifyMailer, closeMailer } = await import('../src/services/mailer.js');

if (sendTo && env.MAIL_TRANSPORT !== 'smtp') {
  console.error('--to sends real mail: set MAIL_TRANSPORT=smtp and the SMTP_* lines in .env first.');
  process.exit(1);
}

const now = Date.now();
const at = (minutes) => new Date(now + minutes * 60_000);

// Sample rows, shaped exactly like what the services hand to enqueue().
const barber = {
  id: 'preview-shop', // real shops always have one; the alert's Excel link needs it
  name: env.MAIL_FROM_NAME ?? 'Luxe Barber',
  timezone: 'Asia/Jerusalem',
  addressLine: 'רחוב דיזנגוף 99, תל אביב',
  instagramUrl: 'https://instagram.com/luxebarber',
  wazeUrl: 'https://waze.com/ul/hsv9example',
  phone: '+97235550123',
  email: null,
  offerTtlMin: 15,
};
const client = { id: 'preview-client', name: 'יוסי כהן', email: sendTo ?? 'client@example.com' };
const service = { name: 'תספורת וזקן', durationMin: 45, priceCents: 12000 };
const appointment = { manageToken: 'preview-manage-token', id: 'sample-appointment', startAt: at(26 * 60), endAt: at(26 * 60 + 50) };
const offer = { token: 'sample-offer-token', slotStartAt: at(3 * 60), expiresAt: at(15) };

const SAMPLES = {
  BOOKING_CONFIRMED: { barber, service, appointment },
  ADMIN_NEW_BOOKING: { barber, service, appointment, via: 'WEB' },
  ADMIN_APPOINTMENT_CANCELLED: { barber, service, appointment },
  WAITLIST_OFFER: { barber, service, offer, minutes: 15 },
  WAITLIST_OFFER_EXPIRED: { barber, offer },
  WAITLIST_JOINED: { barber, service, position: 3 },
  REMINDER_24H: { barber, service, appointment },
  REMINDER_1H: { barber, service, appointment: { ...appointment, startAt: at(120) } },
  APPOINTMENT_CANCELLED: { barber, appointment },
  FLASH_SLOT: { barber, broadcast: { slotStartAt: at(90), message: 'נשאר חלון אחד אחר הצהריים — מי ראשון?' } },
};

if (sendTo && !(await verifyMailer())) process.exit(1);

const templates = sendTo ? ['BOOKING_CONFIRMED', 'WAITLIST_OFFER'] : Object.keys(SAMPLES);
for (const template of templates) {
  const email = renderEmail(template, { ...SAMPLES[template], client });
  const { providerMessageId } = await sendEmail({
    ...email,
    to: client.email,
    template,
    notificationId: `preview-${template.toLowerCase()}-${now}`,
  });
  console.log(`✓ ${template.padEnd(24)} ${email.subject}  →  ${providerMessageId}`);
}

closeMailer();
