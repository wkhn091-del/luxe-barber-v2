/**
 * /api/unsubscribe/:token
 *
 * GET shows a page with one button; POST does the unsubscribing. Not GET alone:
 * mail security scanners open every link in an email, and a GET that
 * unsubscribed would silently drop people who never clicked. POST is also what
 * a mailbox's own "Unsubscribe" button sends (RFC 8058 one-click).
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { htmlPage } from '../lib/htmlPage.js';
import { verifyUnsubscribeToken } from '../lib/unsubscribe.js';

const router = Router();
const invalid = (res) =>
  htmlPage(res.status(400), { title: 'הקישור לא תקין', body: '<p>ייתכן שהקישור הועתק חלקית. אפשר ללחוץ שוב על הקישור שבמייל.</p>' });

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const clientId = verifyUnsubscribeToken(req.params.token);
    if (!clientId) return invalid(res);
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { marketingOptIn: true } });
    if (!client?.marketingOptIn) {
      return htmlPage(res, { title: 'אתם לא ברשימת התפוצה', body: '<p>לא יישלחו אליכם מיילים על תורים שמתפנים.</p>' });
    }
    return htmlPage(res, {
      title: 'הסרה מרשימת התפוצה',
      body:
        '<p>לא תקבלו יותר מיילים על תורים שמתפנים ברגע האחרון.</p><p>אישורי תורים ותזכורות ימשיכו להגיע כרגיל.</p>' +
        '<form method="post"><button type="submit">להסיר אותי</button></form>',
    });
  })
);

router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const clientId = verifyUnsubscribeToken(req.params.token);
    if (!clientId) return invalid(res);
    await prisma.client.updateMany({ where: { id: clientId }, data: { marketingOptIn: false, marketingOptInAt: null } });
    logger.info('marketing unsubscribe', { clientId });
    return htmlPage(res, { title: 'הוסרתם מרשימת התפוצה', body: '<p>לא יישלחו אליכם עוד מיילים שיווקיים. אישורי תורים ותזכורות ימשיכו להגיע.</p>' });
  })
);

export default router;
