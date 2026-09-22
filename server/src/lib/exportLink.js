/**
 * Signed download links for the appointments export.
 *
 * The barber's alert email carries a "download the report" button, and an
 * email cannot carry his login. So the link carries its own proof: a token
 * that authorises ONE thing — downloading this shop's export — and expires.
 *
 * Signed with a key DERIVED from JWT_SECRET, never JWT_SECRET itself: an export
 * link can never pass as an admin session token, nor a session token as a link.
 * Email links live 7 days; the admin's own button mints a 5-minute one.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const KEY = crypto.createHmac('sha256', env.JWT_SECRET).update('luxe:appointments-export:v1').digest();
const AUDIENCE = 'appointments-export';

export function exportToken(barberId, expiresIn = '7d') {
  return jwt.sign({ bid: barberId }, KEY, { algorithm: 'HS256', audience: AUDIENCE, expiresIn });
}

/** @returns {string} the barber id the link was issued for. Throws when invalid or expired. */
export function verifyExportToken(token) {
  return jwt.verify(String(token ?? ''), KEY, { algorithms: ['HS256'], audience: AUDIENCE }).bid;
}

/** The API's own public address — links in emails must point at the API, not the site. */
export function apiOrigin() {
  return (env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, '');
}

export const exportUrl = (barberId, expiresIn) =>
  `${apiOrigin()}/api/export/appointments.csv?token=${encodeURIComponent(exportToken(barberId, expiresIn))}`;
