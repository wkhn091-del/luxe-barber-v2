/**
 * ===========================================================================
 *  MAILER — free transactional email, no domain required
 * ===========================================================================
 *
 * MAIL_TRANSPORT picks how email leaves the server:
 *
 *   brevo    Brevo's HTTP API — free forever, 300 emails a day. It travels
 *            over HTTPS (port 443), so it works on Render's FREE plan, which
 *            blocks outbound SMTP. No domain to verify: Brevo only confirms
 *            the sender address once, with a link.
 *   smtp     Any SMTP server — e.g. Gmail with an App Password. Only on hosts
 *            that allow SMTP (a paid Render instance, a VPS, your laptop).
 *   preview  Nothing is sent; each email is written to MAIL_PREVIEW_DIR as
 *            .html / .eml / .txt / .ics, to open and inspect.
 *   console  One log line per email. The default, so a fresh clone can never
 *            email a real client.
 *
 * This file only DELIVERS. Who gets which email, and what it says, lives in
 * notifications/index.js (the outbox) and notifications/email/ (templates).
 *
 * Failure contract with the outbox: sendEmail() throws. `permanent: true`
 * means no retry can ever work (the recipient address itself was refused), so
 * the row is marked FAILED at once. Everything else — a wrong key, the daily
 * cap, an outage — stays retryable: the email waits and goes out once fixed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { env, isProd } from '../config/env.js';
import { logger } from '../lib/logger.js';

const BREVO_API = 'https://api.brevo.com/v3';
const TIMEOUT_MS = 15_000;

const fromName = (name) => name || env.MAIL_FROM_NAME || 'Luxe Barber';
const fromAddress = () => env.MAIL_FROM_ADDRESS ?? env.SMTP_USER ?? 'no-reply@localhost';
const replyTo = (fallback) => env.MAIL_REPLY_TO || fallback || undefined;
const fail = (message, extra = {}) => Object.assign(new Error(message), { permanent: false, ...extra });

// Plain console lines with ISO timestamps, for checking exact dispatch times
// in Render's log view. The address is masked: logs are not the place for it.
const mask = (email) => String(email ?? '').replace(/^(.).*?(@.*)$/, '$1***$2');
function describe(message) {
  const startsAt = message.meta?.startsAt;
  const lead = startsAt ? ` · appointment ${startsAt} (${Math.round((new Date(startsAt) - Date.now()) / 60_000)} min ahead)` : '';
  return `${message.template ?? 'email'} to ${mask(message.to)}${message.notificationId ? ` #${message.notificationId}` : ''}${lead}`;
}
async function timed(transport, message, send) {
  const t0 = Date.now();
  console.log(`${new Date(t0).toISOString()} [${transport}] → sending ${describe(message)}`);
  try {
    const result = await send();
    console.log(`${new Date().toISOString()} [${transport}] ✓ accepted in ${Date.now() - t0}ms · id ${result.providerMessageId}`);
    return result;
  } catch (err) {
    console.log(`${new Date().toISOString()} [${transport}] ✗ failed in ${Date.now() - t0}ms · ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Brevo — HTTPS API (the Render free plan path)
// ---------------------------------------------------------------------------

async function brevo(pathname, init = {}) {
  try {
    const res = await fetch(`${BREVO_API}${pathname}`, {
      ...init,
      headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { res, data: await res.json().catch(() => ({})) };
  } catch (err) {
    // Nothing reached Brevo (network, DNS, our own timeout): try again later.
    throw fail(`Brevo unreachable: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
}

/** Only a refused RECIPIENT is permanent. A key, sender or quota problem is ours to fix. */
function brevoError(status, data) {
  const said = String(data?.message ?? '');
  const base = `${['Brevo', status, data?.code].filter(Boolean).join(' ')}: ${said}`;
  if (status === 401) {
    return fail(
      /\bip\b/i.test(said)
        ? `${base} — Brevo blocked this server's IP. Brevo → Settings → Security → Authorised IPs: turn blocking off (Render's IPs change).`
        : `${base} — BREVO_API_KEY must be an API key (Brevo → Settings → SMTP & API → API Keys), not the SMTP key.`
    );
  }
  if (status === 402 || status === 429 || /credit|limit|quota/i.test(said)) {
    return fail(`${base} — daily cap or rate limit (free plan: 300 emails a day). The queue retries.`);
  }
  if (status === 403) return fail(`${base} — Brevo has not enabled sending on this account yet (new accounts are reviewed).`);
  if (status === 400 && /sender|from/i.test(said)) {
    return fail(`${base} — MAIL_FROM_ADDRESS must be a sender verified in Brevo (Settings → Senders, Domains, IPs).`);
  }
  return fail(base, { permanent: status === 400 });
}

async function sendWithBrevo(message) {
  const reply = replyTo(message.replyTo);
  const { res, data } = await brevo('/smtp/email', {
    method: 'POST',
    body: JSON.stringify({
      sender: { name: fromName(message.fromName), email: fromAddress() },
      to: [{ email: message.to }],
      ...(reply ? { replyTo: { email: reply } } : {}),
      subject: message.subject,
      htmlContent: message.html,
      ...(message.text ? { textContent: message.text } : {}),
      // The calendar invite, attached: "Add to calendar" in Gmail and Apple Mail.
      ...(message.ics
        ? { attachment: [{ name: 'appointment.ics', content: Buffer.from(message.ics, 'utf8').toString('base64') }] }
        : {}),
      headers: {
        'X-Entity-Ref-ID': String(message.notificationId ?? Date.now()),
        // Same key on a retry → Brevo drops the duplicate, so a crash between
        // "accepted" and the outbox update never sends the client two copies.
        ...(message.notificationId ? { idempotencyKey: String(message.notificationId) } : {}),
      },
      ...(message.template ? { tags: [message.template] } : {}),
    }),
  });
  if (!res.ok) throw brevoError(res.status, data);
  return { providerMessageId: data.messageId ?? `brevo:${message.notificationId ?? Date.now()}` };
}

// ---------------------------------------------------------------------------
// SMTP — Gmail with an App Password, or any SMTP server
// ---------------------------------------------------------------------------

const isGmail = () => /(^|\.)(gmail|googlemail)\.com$/i.test(env.SMTP_HOST);
let smtp = null;

function smtpTransport() {
  if (smtp) return smtp;
  const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
  smtp = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    requireTLS: !secure, // on 587, never send the password before STARTTLS
    // Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces are decoration.
    auth: { user: env.SMTP_USER, pass: isGmail() ? env.SMTP_PASS?.replace(/\s+/g, '') : env.SMTP_PASS },
    pool: env.ENABLE_SCHEDULER, // one warm connection on a persistent host
    maxConnections: 2,
    rateDelta: 1000,
    rateLimit: 5, // Gmail throttles bursts
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: 'TLSv1.2' },
  });
  return smtp;
}

/** The MIME message — used for SMTP sends and for the .eml preview. */
function composeMime(message) {
  const domain = fromAddress().split('@')[1] || 'localhost';
  return {
    from: { name: fromName(message.fromName), address: fromAddress() },
    to: message.to,
    replyTo: replyTo(message.replyTo),
    subject: message.subject,
    html: message.html,
    text: message.text,
    // Deterministic: a retry after a crash reuses the id and Gmail drops the duplicate.
    messageId: message.notificationId ? `<${message.notificationId}@${domain}>` : undefined,
    headers: {
      'X-Entity-Ref-ID': String(message.notificationId ?? Date.now()),
      'Auto-Submitted': 'auto-generated',
      // RFC 8058: the mailbox's own "Unsubscribe" button POSTs here. (Brevo's
      // API is not given these standard headers — it refuses what it does not
      // expect — so there the visible footer link is the opt-out.)
      ...(message.unsubscribeUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
    },
    ...(message.unsubscribeUrl ? { list: { unsubscribe: { url: message.unsubscribeUrl, comment: 'Unsubscribe' } } } : {}),
    ...(message.ics ? { icalEvent: { method: 'PUBLISH', filename: 'appointment.ics', content: message.ics } } : {}),
  };
}

function smtpHint(err) {
  if (err?.code === 'EAUTH') {
    return isGmail()
      ? 'Gmail refused the login: SMTP_PASS must be a 16-letter App Password (Google Account → Security → 2-Step Verification → App passwords).'
      : 'The SMTP server refused SMTP_USER / SMTP_PASS.';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(err?.code)) {
    return "Could not reach the SMTP server. Render's free plan blocks SMTP ports — use MAIL_TRANSPORT=brevo there.";
  }
  return undefined;
}

async function sendWithSmtp(message) {
  try {
    const info = await smtpTransport().sendMail(composeMime(message));
    return { providerMessageId: info.messageId };
  } catch (err) {
    const status = Number(err.responseCode);
    // A 5xx is a refusal — except a login problem (fix the config and the queue
    // drains) and Gmail's daily cap, 550 5.4.5, which lifts tomorrow.
    err.permanent =
      err.code === 'EENVELOPE' ||
      (err.code !== 'EAUTH' && status >= 500 && !/5\.4\.5|limit|quota/i.test(String(err.response ?? '')));
    const hint = smtpHint(err);
    if (hint) err.message = `${err.message} — ${hint}`;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object} message  an outbox payload: { to, subject, html, text, ics?,
 *                          fromName?, replyTo?, notificationId?, template? }
 * @returns {Promise<{ providerMessageId: string }>}
 */
export async function sendEmail(message) {
  if (!message?.to) throw fail('No recipient address on the message', { permanent: true });

  switch (env.MAIL_TRANSPORT) {
    case 'brevo':
      return timed('brevo', message, () => sendWithBrevo(message));
    case 'smtp':
      return timed('smtp', message, () => sendWithSmtp(message));
    case 'preview':
      return writePreview(message);
    default:
      logger.info('[mail:console]', { to: message.to, subject: message.subject, template: message.template });
      return { providerMessageId: `console:${message.notificationId ?? Date.now()}` };
  }
}

async function writePreview(message) {
  const dir = path.resolve(env.MAIL_PREVIEW_DIR);
  await fs.mkdir(dir, { recursive: true });
  const base = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${message.template ?? 'email'}`);
  // The .eml is the exact MIME an SMTP send would produce — open it in Apple Mail or Outlook.
  const { message: raw } = await nodemailer
    .createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
    .sendMail(composeMime(message));
  await Promise.all([
    fs.writeFile(`${base}.html`, message.html ?? '', 'utf8'),
    fs.writeFile(`${base}.txt`, message.text ?? '', 'utf8'),
    fs.writeFile(`${base}.eml`, raw),
    message.ics ? fs.writeFile(`${base}.ics`, message.ics, 'utf8') : null,
  ]);
  logger.info('[mail:preview]', { to: message.to, subject: message.subject, file: `${base}.html` });
  return { providerMessageId: `preview:${path.basename(base)}` };
}

/**
 * Checked once at boot, so a wrong key or an unapproved account shows up in
 * the deploy log instead of as silence after the first booking. Never fatal:
 * bookings keep working and emails wait in the outbox until it's fixed.
 */
export async function verifyMailer() {
  try {
    if (env.MAIL_TRANSPORT === 'brevo') {
      const { res, data } = await brevo('/account');
      if (!res.ok) throw brevoError(res.status, data);
      const plan = (data.plan ?? []).map((p) => (p.credits != null ? `${p.type} (${p.credits} left)` : p.type)).join(', ');
      logger.info('[mail] Brevo ready', { account: data.email, plan, sender: fromAddress() });
      return true;
    }
    if (env.MAIL_TRANSPORT === 'smtp') {
      await smtpTransport().verify();
      logger.info('[mail] SMTP ready', { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER });
      return true;
    }
    const where = env.MAIL_TRANSPORT === 'preview' ? `written to ${path.resolve(env.MAIL_PREVIEW_DIR)}` : 'only logged, not sent';
    (isProd ? logger.warn : logger.info).call(logger, `[mail] MAIL_TRANSPORT=${env.MAIL_TRANSPORT}: emails are ${where}`);
    return false;
  } catch (err) {
    logger.error('[mail] mail check failed — emails will queue until it is fixed', {
      error: err.message,
      hint: smtpHint(err),
    });
    return false;
  }
}

/** Releases pooled SMTP sockets on shutdown. */
export function closeMailer() {
  smtp?.close();
  smtp = null;
}
