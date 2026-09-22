/**
 * GET /api/calendar/:token.ics — the barber's subscription feed.
 * Authorised by the token in the URL (services/calendarFeed.service.js).
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/validate.js';
import { calendarFeed } from '../services/calendarFeed.service.js';

const router = Router();

router.get(
  '/:file',
  asyncHandler(async (req, res) => {
    const ics = await calendarFeed(String(req.params.file).replace(/\.ics$/i, ''));
    if (!ics) return res.status(404).type('text/plain').send('Not found');
    return res
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="appointments.ics"',
        'Cache-Control': 'private, max-age=300',
        'X-Robots-Tag': 'noindex',
      })
      .send(ics);
  })
);

export default router;
