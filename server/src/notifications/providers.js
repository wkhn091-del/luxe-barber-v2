/**
 * Channel providers behind one interface. Swapping vendors is an env var, not a
 * refactor.
 *
 *   send({ to, channel, text, subject, html, ics, metaTemplate, vars, locale, … })
 *     → { providerMessageId }   (throws on failure; the dispatcher retries
 *                                 unless the error carries `permanent: true`)
 *
 * EMAIL goes through the free SMTP mailer and is the only automated channel in
 * the default setup. WhatsApp and SMS are automated only when NOTIFY_PROVIDER
 * names a paid vendor; otherwise the barber sends them by hand from the admin.
 */
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../services/mailer.js';

const consoleProvider = {
  async send({ to, channel, text }) {
    logger.info('[notification:console]', { to, channel, text });
    return { providerMessageId: `console_${Date.now()}` };
  },
};

const twilioProvider = {
  async send({ to, channel, text }) {
    const from = channel === 'WHATSAPP' ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM;
    const prefix = channel === 'WHATSAPP' ? 'whatsapp:' : '';

    const body = new URLSearchParams({
      To: `${prefix}${to}`,
      From: `${prefix}${from}`,
      Body: text,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );

    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return { providerMessageId: json.sid };
  },
};

const metaProvider = {
  /**
   * WhatsApp Cloud API. Business-initiated messages must use a pre-approved
   * template, which is why every entry in templates.js carries `metaTemplate`
   * and an ordered `vars` array.
   */
  async send({ to, metaTemplate, vars = [], locale = 'he' }) {
    const res = await fetch(`https://graph.facebook.com/v20.0/${env.META_WABA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'template',
        template: {
          name: metaTemplate,
          language: { code: locale },
          components: [
            { type: 'body', parameters: vars.map((v) => ({ type: 'text', text: String(v) })) },
          ],
        },
      }),
    });

    if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return { providerMessageId: json.messages?.[0]?.id };
  },
};

/** Free: Brevo's HTTP API, or any SMTP server. See services/mailer.js. */
const emailProvider = { send: (message) => sendEmail(message) };


export function providerFor(channel) {
  if (channel === 'EMAIL') return emailProvider;
  if (env.NOTIFY_PROVIDER === 'meta' && channel === 'WHATSAPP') return metaProvider;
  if (env.NOTIFY_PROVIDER === 'twilio') return twilioProvider;
  return consoleProvider;
}
