/**
 * Transactional outbox.
 *
 * `enqueue()` takes the transaction client and writes a QUEUED row alongside the
 * state change that caused it. `dispatchQueued()` drains the queue.
 *
 * Why not just send inline:
 *   - send inside the transaction + rollback → you told a client they have a
 *     slot they don't have;
 *   - send after commit + process dies → the offer ticks down in silence and
 *     expires unseen, which is exactly the failure the waitlist exists to avoid.
 *
 * The outbox closes both holes: the row either commits with the state change or
 * neither does, and anything QUEUED is retried until it lands.
 *
 * THE FREE SETUP. Email is the automated channel — the booking forms require
 * an address, so every client gets their confirmation and reminders. WhatsApp
 * stays a human tap in the admin (a wa.me link, never automated). A client with
 * no email on file — one the barber booked by hand — gets a SKIPPED row
 * (`no_email`): a record, not an error.
 */
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { renderTemplate } from './templates.js';
import { renderEmail } from './email/templates.js';
import { unsubscribeUrl } from '../lib/unsubscribe.js';
import { providerFor } from './providers.js';

const MAX_ATTEMPTS = 5;
/** Exponential backoff, in minutes, indexed by attempt count. */
const BACKOFF_MIN = [0, 1, 5, 15, 60];

/** Phone channels a machine may send on. Empty in the free setup. */
const AUTOMATED_PHONE = { twilio: ['WHATSAPP', 'SMS'], meta: ['WHATSAPP'] }[env.NOTIFY_PROVIDER] ?? [];

/**
 * Pick the channel a client can actually be reached on automatically.
 * Returns null when there is none — the caller records SKIPPED rather than
 * silently dropping the message.
 */
export function resolveChannel(client) {
  if (AUTOMATED_PHONE.includes('WHATSAPP') && client.whatsappOptIn && client.phone) return 'WHATSAPP';
  if (AUTOMATED_PHONE.includes('SMS') && client.smsOptIn && client.phone) return 'SMS';
  if (client.email) return 'EMAIL';
  return null;
}

/**
 * Prisma `where` fragment: clients the automated channels can reach. A
 * broadcast filters on it so its recipient count is the number of messages
 * that will really go out, not a hopeful total.
 */
export function reachableClientWhere() {
  return AUTOMATED_PHONE.length ? {} : { email: { not: null } };
}

/** The appointment moment, carried along so the mailer can log how far ahead each email went out. */
const metaOf = (data) => ({ startsAt: new Date(data.appointment?.startAt ?? data.offer?.slotStartAt ?? NaN).toISOString?.() ?? null });
const safeMeta = (data) => {
  try {
    return metaOf(data);
  } catch {
    return { startsAt: null };
  }
};

function emailPayload(template, data, client) {
  return {
    to: client.email,
    locale: client.locale,
    ...renderEmail(template, { ...data, client }),
    meta: safeMeta(data),
    // Marketing only: lets the mailer add the List-Unsubscribe header too.
    ...(template === 'FLASH_SLOT' ? { unsubscribeUrl: unsubscribeUrl(client.id) } : {}),
  };
}

function phonePayload(template, data, client) {
  const rendered = renderTemplate(template, { ...data, client });
  return {
    to: client.phone,
    locale: client.locale,
    text: rendered.text,
    subject: rendered.subject,
    metaTemplate: rendered.metaTemplate,
    vars: rendered.vars,
  };
}

/**
 * The channels one message goes out on. Paid providers (Twilio / Meta) keep
 * their one-channel rule; the free setup is email, for anyone with an address.
 */
function channelsFor(client, template) {
  if (AUTOMATED_PHONE.length) {
    const one = resolveChannel(client);
    return one ? [one] : [];
  }
  const channels = [];
  if (client.email) channels.push('EMAIL');
  return channels;
}

function payloadFor(channel, template, data, client) {
  if (channel === 'EMAIL') return emailPayload(template, data, client);
  return phonePayload(template, data, client);
}

/**
 * Queue a message. MUST be called with the surrounding transaction client so it
 * commits atomically with the change it announces.
 *
 * @param {object} tx        Prisma transaction client
 * @param {object} opts
 * @param {object} opts.client    Client row
 * @param {string} opts.template  Key in the template catalogues
 * @param {object} opts.data      Render data
 * @param {string} [opts.channel] Force one channel; otherwise channelsFor decides
 */
export async function enqueue(tx, { client, template, data, channel }) {
  const channels = channel ? [channel] : channelsFor(client, template);

  if (!channels.length) {
    return tx.notificationLog.create({
      data: {
        clientId: client.id,
        channel: AUTOMATED_PHONE.length ? 'SMS' : 'EMAIL',
        template,
        status: 'SKIPPED',
        payload: { reason: AUTOMATED_PHONE.length ? 'no_consented_channel' : 'no_email' },
      },
    });
  }

  let first;
  for (const ch of channels) {
    // Rendered HERE, inside the transaction, so the message is a snapshot of
    // the state it announces. But a rendering bug must never roll back the
    // booking it describes — it becomes a FAILED row and a loud log line.
    let payload;
    try {
      payload = payloadFor(ch, template, data, client);
    } catch (err) {
      logger.error('notification render failed', { template, channel: ch, error: err.message });
      const failed = await tx.notificationLog.create({
        data: {
          clientId: client.id,
          channel: ch,
          template,
          status: 'FAILED',
          error: `render: ${String(err.message).slice(0, 480)}`,
          payload: { reason: 'render_failed' },
        },
      });
      first ??= failed;
      continue;
    }
    const row = await tx.notificationLog.create({
      data: { clientId: client.id, channel: ch, template, status: 'QUEUED', payload },
    });
    first ??= row;
  }
  return first;
}

/**
 * The barber's own alert: "someone just booked". Same outbox, same retries and
 * the same transaction as the client's confirmation — but addressed to the
 * shop (ADMIN_NOTIFY_EMAIL, else MAIL_FROM_ADDRESS) and tied to no client row:
 * it is not a message TO the client, so it never shows up in their history.
 */
export async function enqueueForBarber(tx, { template, data }) {
  const to = env.ADMIN_NOTIFY_EMAIL || env.MAIL_FROM_ADDRESS;
  if (!to) {
    return tx.notificationLog.create({
      data: { clientId: null, channel: 'EMAIL', template, status: 'SKIPPED', payload: { reason: 'no_admin_address' } },
    });
  }

  let payload;
  try {
    payload = { to, locale: 'he', ...renderEmail(template, data), meta: safeMeta(data) };
  } catch (err) {
    logger.error('barber notification render failed', { template, error: err.message });
    return tx.notificationLog.create({
      data: {
        clientId: null,
        channel: 'EMAIL',
        template,
        status: 'FAILED',
        error: `render: ${String(err.message).slice(0, 480)}`,
        payload: { reason: 'render_failed' },
      },
    });
  }

  return tx.notificationLog.create({ data: { clientId: null, channel: 'EMAIL', template, status: 'QUEUED', payload } });
}

/**
 * Drain the outbox. Called by the sweeper and by POST /api/internal/sweep.
 * Failures are recorded with a backoff, not thrown — one dead address must not
 * stall the queue behind it.
 */
export async function dispatchQueued({ limit = 25 } = {}) {
  const due = await prisma.notificationLog.findMany({
    where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    const payload = row.payload ?? {};

    // An offer that lands after it expired is worse than no offer at all.
    if (payload.staleAfter && new Date(payload.staleAfter) <= new Date()) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: 'SKIPPED', error: 'stale: the moment it announced has passed' },
      });
      skipped += 1;
      continue;
    }

    const provider = providerFor(row.channel);
    try {
      const { providerMessageId } = await provider.send({
        ...payload,
        channel: row.channel,
        template: row.template,
        notificationId: row.id,
      });

      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: row.attempts + 1,
          providerMessageId: providerMessageId ?? null,
          error: null,
        },
      });
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const permanent = err.permanent === true;
      const exhausted = permanent || attempts >= MAX_ATTEMPTS;
      const delay = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)];

      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: exhausted ? 'FAILED' : 'QUEUED',
          attempts,
          error: String(err.message).slice(0, 500),
          nextAttemptAt: new Date(Date.now() + delay * 60_000),
        },
      });

      logger.warn('notification send failed', {
        id: row.id,
        template: row.template,
        channel: row.channel,
        attempts,
        exhausted,
        permanent,
        code: err.code,
      });
      failed += 1;
    }
  }

  return { sent, failed, skipped, considered: due.length };
}
