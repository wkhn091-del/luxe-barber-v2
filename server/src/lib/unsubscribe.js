/**
 * Unsubscribe links for marketing broadcasts (the last-minute-slot emails).
 *
 * Israel's anti-spam law requires a working opt-out in every marketing
 * message, and it must keep working years later — so the link never expires.
 * It names one client and is signed with a key DERIVED from JWT_SECRET (never
 * the secret itself): it cannot be forged, and it can do exactly one thing —
 * turn marketing off for that client. Confirmations and reminders are
 * transactional and keep coming.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { apiOrigin } from './exportLink.js';

const KEY = crypto.createHmac('sha256', env.JWT_SECRET).update('luxe:unsubscribe:v1').digest();
const mac = (clientId) => crypto.createHmac('sha256', KEY).update(String(clientId)).digest('base64url').slice(0, 32);

export const unsubscribeToken = (clientId) => `${clientId}.${mac(clientId)}`;

/** @returns {string|null} the client id, or null when the token is not one of ours. */
export function verifyUnsubscribeToken(token) {
  const [clientId, given] = String(token ?? '').split('.');
  if (!clientId || !given) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(mac(clientId));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? clientId : null;
}

export const unsubscribeUrl = (clientId) => `${apiOrigin()}/api/unsubscribe/${unsubscribeToken(clientId)}`;
