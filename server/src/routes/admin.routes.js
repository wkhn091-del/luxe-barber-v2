/**
 * Admin API — the barber's phone.
 *
 * Every route is scoped to `req.auth.barberId` taken from the JWT, never from
 * the request body, so a compromised client cannot edit another shop's schedule.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { addMinutes } from '../lib/time.js';
import {
  getWorkingHours,
  replaceWorkingHours,
  listExceptions,
  openExtraWindow,
  blockTime,
  removeException,
  broadcastFlashSlot,
  suggestFlashSlots,
} from '../services/schedule.service.js';
import {
  listAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  createAppointment,
} from '../services/booking.service.js';
import { listWaitlist, promoteEntry } from '../services/waitlist.service.js';
import { deleteAppointment, deleteClient, getSettings, listClients, updateSettings } from '../services/admin.service.js';
import { settingsSchema } from '../services/settings.schema.js';
import { exportUrl } from '../lib/exportLink.js';
import { calendarFeedLinks } from '../services/calendarFeed.service.js';
import { sheetFeedLinks } from '../services/sheetFeed.service.js';

const router = Router();

// ---------------------------------- Auth -----------------------------------
//
// Sign-in, PIN unlock and device management live in adminAuth.routes.js, which
// is mounted at /api/admin/auth ahead of this router. Everything here is behind
// the token.

router.use(requireAdmin);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const barber = await prisma.barber.findUnique({ where: { id: req.auth.barberId } });
    res.json({ barber, role: req.auth.role });
  })
);

// ------------------------------ Working hours ------------------------------

router.get(
  '/working-hours',
  asyncHandler(async (req, res) => {
    res.json({ rules: await getWorkingHours(req.auth.barberId) });
  })
);

const hoursSchema = z.object({
  rules: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
        active: z.boolean().optional(),
      })
    )
    .max(40),
});

router.put(
  '/working-hours',
  validate(hoursSchema),
  asyncHandler(async (req, res) => {
    res.json({ rules: await replaceWorkingHours(req.auth.barberId, req.body.rules) });
  })
);

// ------------------------------- Exceptions --------------------------------

router.get(
  '/schedule-exceptions',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : addMinutes(from, 60 * 24 * 60);
    res.json({ exceptions: await listExceptions({ barberId: req.auth.barberId, from, to }) });
  })
);

const exceptionSchema = z.object({
  kind: z.enum(['OPEN', 'BLOCK']),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  note: z.string().max(200).optional(),
  serviceId: z.string().optional(),
  force: z.boolean().optional(),
});

/**
 * The money endpoint of the admin dashboard.
 *
 * kind=OPEN  → insert the window AND immediately offer every slot it created to
 *              the waitlist. The response reports how many offers went out, so
 *              the UI can say "2-hour window opened — 4 offers sent".
 * kind=BLOCK → refuse if real appointments sit inside, unless force=true.
 */
router.post(
  '/schedule-exceptions',
  validate(exceptionSchema),
  asyncHandler(async (req, res) => {
    const base = {
      barberId: req.auth.barberId,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      note: req.body.note,
      createdBy: req.auth.userId,
    };

    if (req.body.kind === 'OPEN') {
      const result = await openExtraWindow({ ...base, serviceId: req.body.serviceId });
      return res.status(201).json(result);
    }

    const result = await blockTime({ ...base, force: req.body.force ?? false });
    return res.status(201).json(result);
  })
);

router.delete(
  '/schedule-exceptions/:id',
  asyncHandler(async (req, res) => {
    res.json(await removeException({ barberId: req.auth.barberId, id: req.params.id }));
  })
);

// ------------------------------ Appointments -------------------------------

router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : addMinutes(from, 7 * 24 * 60);
    res.json({
      appointments: await listAppointments({ barberId: req.auth.barberId, from, to }),
    });
  })
);

router.post(
  '/appointments',
  validate(
    z.object({
      serviceId: z.string(),
      startAt: z.coerce.date(),
      client: z.object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().email().optional(),
      }),
      note: z.string().max(280).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    // Walk-ins go through exactly the same path as web bookings — same
    // validation, same collision guarantees.
    const { appointment } = await createAppointment({
      barberId: req.auth.barberId,
      serviceId: req.body.serviceId,
      startAt: req.body.startAt,
      clientInput: req.body.client,
      clientNote: req.body.note,
      source: 'ADMIN',
    });
    res.status(201).json({ appointment });
  })
);

router.patch(
  '/appointments/:id',
  validate(z.object({ status: z.enum(['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']) })),
  asyncHandler(async (req, res) => {
    if (req.body.status === 'CANCELLED') {
      // Goes through the booking service so the waitlist refill fires.
      return res.json(await cancelAppointment({ id: req.params.id, cancelledBy: 'ADMIN' }));
    }
    return res.json({
      appointment: await updateAppointmentStatus({ id: req.params.id, status: req.body.status }),
    });
  })
);

// -------------------------------- Waitlist ---------------------------------

router.get(
  '/waitlist',
  asyncHandler(async (req, res) => {
    res.json({ entries: await listWaitlist(req.auth.barberId) });
  })
);

router.post(
  '/waitlist/:id/promote',
  validate(z.object({ startAt: z.coerce.date(), endAt: z.coerce.date() })),
  asyncHandler(async (req, res) => {
    res.json(
      await promoteEntry({
        entryId: req.params.id,
        startAt: req.body.startAt,
        endAt: req.body.endAt,
      })
    );
  })
);

// ------------------------------ Flash slots --------------------------------

router.get(
  '/flash-slots/suggestions',
  asyncHandler(async (req, res) => {
    res.json({ slots: await suggestFlashSlots({ barberId: req.auth.barberId }) });
  })
);

router.post(
  '/flash-slots',
  validate(
    z.object({
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      message: z.string().max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await broadcastFlashSlot({
      barberId: req.auth.barberId,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      message: req.body.message,
      createdBy: req.auth.userId,
    });
    res.status(201).json(result);
  })
);

// --------------------------------- Gallery ---------------------------------

/**
 * Images are uploaded straight from the browser to object storage (Cloudinary /
 * S3 / UploadThing) and only the resulting URLs are posted here. The API never
 * proxies binaries — that keeps it inside serverless body limits and keeps
 * uploads fast on a phone.
 */
router.post(
  '/gallery',
  validate(
    z.object({
      beforeUrl: z.string().url(),
      afterUrl: z.string().url(),
      beforeBlurhash: z.string().optional(),
      afterBlurhash: z.string().optional(),
      caption: z.string().max(140).optional(),
      tags: z.array(z.string().max(24)).max(8).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const maxOrder = await prisma.galleryItem.aggregate({
      where: { barberId: req.auth.barberId },
      _max: { sortOrder: true },
    });
    const item = await prisma.galleryItem.create({
      data: {
        ...req.body,
        tags: req.body.tags ?? [],
        barberId: req.auth.barberId,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    res.status(201).json({ item });
  })
);

router.get(
  '/gallery',
  asyncHandler(async (req, res) => {
    res.json({
      items: await prisma.galleryItem.findMany({
        where: { barberId: req.auth.barberId },
        orderBy: { sortOrder: 'asc' },
      }),
    });
  })
);

router.patch(
  '/gallery/:id',
  validate(
    z.object({
      caption: z.string().max(140).optional(),
      published: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { count } = await prisma.galleryItem.updateMany({
      where: { id: req.params.id, barberId: req.auth.barberId },
      data: req.body,
    });
    res.json({ updated: count });
  })
);

router.delete(
  '/gallery/:id',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.galleryItem.deleteMany({
      where: { id: req.params.id, barberId: req.auth.barberId },
    });
    res.json({ deleted: count });
  })
);

// ---------------------------------- Stats ----------------------------------

/**
 * The numbers that justify the waitlist existing: how many slots it saved, and
 * how often the first person offered actually takes it.
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const barberId = req.auth.barberId;
    const since = addMinutes(new Date(), -30 * 24 * 60);

    const [completed, noShows, cancelled, waitlistSaves, offersSent, activeQueue] =
      await Promise.all([
        prisma.appointment.count({ where: { barberId, status: 'COMPLETED', startAt: { gte: since } } }),
        prisma.appointment.count({ where: { barberId, status: 'NO_SHOW', startAt: { gte: since } } }),
        prisma.appointment.count({ where: { barberId, status: 'CANCELLED', startAt: { gte: since } } }),
        prisma.slotOffer.count({ where: { barberId, status: 'CONFIRMED', createdAt: { gte: since } } }),
        prisma.slotOffer.count({ where: { barberId, createdAt: { gte: since } } }),
        prisma.waitlistEntry.count({ where: { barberId, status: 'ACTIVE' } }),
      ]);

    res.json({
      periodDays: 30,
      completed,
      noShows,
      cancelled,
      activeQueue,
      waitlist: {
        offersSent,
        slotsRecovered: waitlistSaves,
        // Of the cancellations in the period, how many were refilled?
        recoveryRate: cancelled ? Number((waitlistSaves / cancelled).toFixed(2)) : null,
        conversionRate: offersSent ? Number((waitlistSaves / offersSent).toFixed(2)) : null,
      },
    });
  })
);

// ------------------------------ Clean-up & clients --------------------------

/**
 * Deletes an appointment outright — no message, no waitlist offer. For test
 * bookings and demo data. Cancelling is PATCH { status: 'CANCELLED' }.
 */
router.delete(
  '/appointments/:id',
  asyncHandler(async (req, res) => {
    res.json(await deleteAppointment(req.auth.barberId, req.params.id));
  })
);

router.get(
  '/clients',
  asyncHandler(async (req, res) => {
    res.json(await listClients({ q: String(req.query.q ?? '').slice(0, 60) }));
  })
);

/** A client with all their appointments, waitlist places and message history. */
router.delete(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    res.json(await deleteClient(req.params.id));
  })
);

// --------------------------------- Export -----------------------------------

/** A 5-minute download link, so the browser downloads natively (iOS included). */
router.post(
  '/export/link',
  asyncHandler(async (req, res) => {
    res.json({ url: exportUrl(req.auth.barberId, '5m') });
  })
);

// ------------------------------ Calendar feed -------------------------------

router.get(
  '/calendar-feed',
  asyncHandler(async (req, res) => {
    res.json(await calendarFeedLinks(req.auth.barberId));
  })
);

/** A new secret link; every old copy stops working at once. */
router.post(
  '/calendar-feed/reset',
  asyncHandler(async (req, res) => {
    res.json(await calendarFeedLinks(req.auth.barberId, { reset: true }));
  })
);

// ---------------------------- Live spreadsheet ------------------------------

router.get(
  '/sheet-feed',
  asyncHandler(async (req, res) => {
    res.json(await sheetFeedLinks(req.auth.barberId));
  })
);

/** A new secret link; spreadsheets using the old one stop updating at once. */
router.post(
  '/sheet-feed/reset',
  asyncHandler(async (req, res) => {
    res.json(await sheetFeedLinks(req.auth.barberId, { reset: true }));
  })
);

// -------------------------------- Settings ----------------------------------

/** The business details the public site, the emails and WhatsApp all read. */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json(await getSettings(req.auth.barberId));
  })
);

router.patch(
  '/settings',
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateSettings(req.auth.barberId, req.body));
  })
);

export default router;
