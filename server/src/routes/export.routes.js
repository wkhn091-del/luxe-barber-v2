/**
 * GET /api/export/appointments.csv?token=…
 *
 * Authorised by the signed link itself (lib/exportLink.js), not by an admin
 * session — that is what lets the button in the barber's email download the
 * file directly. An expired or tampered link gets a Hebrew page explaining
 * where to get a fresh one, never a stack trace.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { verifyExportToken } from '../lib/exportLink.js';
import { appointmentsCsv } from '../services/export.service.js';
import { sheetFeedCsv } from '../services/sheetFeed.service.js';
import { SHOP_TIMEZONE } from '../lib/timezone.js';
import { logger } from '../lib/logger.js';
import { htmlPage } from '../lib/htmlPage.js';

const router = Router();

router.get(
  '/appointments.csv',
  asyncHandler(async (req, res) => {
    let barberId;
    try {
      barberId = verifyExportToken(req.query.token);
    } catch {
      return htmlPage(res.status(401), {
        title: 'הקישור פג תוקף',
        body:
          '<p>קישורי הורדה מהמייל תקפים לשבוע. דוח עדכני אפשר להוריד מהניהול: היום ← ייצוא לאקסל.</p>' +
          `<p><a href="${env.PUBLIC_APP_URL.replace(/\/+$/, '')}/admin">לניהול</a></p>`,
      });
    }
    const csv = await appointmentsCsv(barberId);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIMEZONE }).format(new Date());
    logger.info('appointments export downloaded', { barberId, bytes: Buffer.byteLength(csv) });
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="appointments-${today}.csv"`,
        // Browsers, Excel and any proxy re-fetch every time. (Google Sheets
        // ignores these for IMPORTDATA — see the Apps Script on the sheet page.)
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Robots-Tag': 'noindex',
      })
      .send(csv);
  })
);

/**
 * GET /api/export/live.csv?secret=… — the permanent feed a spreadsheet re-fetches
 * (services/sheetFeed.service.js). `&for=google` drops the byte-order mark:
 * Excel needs it to read the Hebrew as UTF-8, but Google Sheets would keep it
 * as an invisible character at the start of the first header.
 */
router.get(
  '/live.csv',
  asyncHandler(async (req, res) => {
    const csv = await sheetFeedCsv(req.query.secret, { bom: req.query.for !== 'google' });
    if (!csv) return res.status(404).type('text/plain').send('Not found');
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="appointments-live.csv"',
        // Browsers, Excel and any proxy re-fetch every time. (Google Sheets
        // ignores these for IMPORTDATA — see the Apps Script on the sheet page.)
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Robots-Tag': 'noindex',
      })
      .send(csv);
  })
);

export default router;
