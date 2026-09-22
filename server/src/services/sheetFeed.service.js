/**
 * The live spreadsheet feed: the appointments report as a permanent CSV URL.
 * Google Sheets (=IMPORTDATA) and Excel (Data → From Web) re-fetch it on their
 * own schedule, so the barber's spreadsheet stays current with nobody exporting
 * anything.
 *
 * Same design as the calendar feed: a spreadsheet cannot log in, so the URL IS
 * the key — a long random token on the barber's row, permanent until reset.
 * Random rather than derived from a secret, so a reset cuts off every old copy
 * of the link at once.
 */
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { apiOrigin } from '../lib/exportLink.js';
import { appointmentsCsv } from './export.service.js';

export function sheetLinks(token) {
  const url = `${apiOrigin()}/api/export/live.csv?secret=${token}`;
  // &for=google: the same feed without the byte-order mark (see export.routes.js).
  const google = `${url}&for=google`;
  return { url, google, formula: `=IMPORTDATA("${google}")` };
}

/** The barber's links, creating the token on first use; `reset` replaces it. */
export async function sheetFeedLinks(barberId, { reset = false } = {}) {
  const barber = await prisma.barber.findUnique({ where: { id: barberId }, select: { sheetFeedToken: true } });
  let token = barber?.sheetFeedToken;
  if (!token || reset) {
    token = crypto.randomBytes(24).toString('base64url');
    await prisma.barber.update({ where: { id: barberId }, data: { sheetFeedToken: token } });
  }
  return sheetLinks(token);
}

/** @returns {Promise<string|null>} the CSV, or null for an unknown or reset secret. */
export async function sheetFeedCsv(secret, { bom = true } = {}) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(secret ?? ''))) return null;
  const barber = await prisma.barber.findUnique({ where: { sheetFeedToken: secret }, select: { id: true } });
  return barber ? appointmentsCsv(barber.id, { bom }) : null;
}
