/**
 * Public API — everything the client-facing SPA talks to.
 * No auth; capability tokens (manageToken, offer token) stand in for sessions.
 */
import { Router } from 'express';
import { summarizeRules } from '../lib/hoursSummary.js';
import { bookingIpLimiter, bookingPhoneLimiter } from '../middleware/security.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { getAvailability, groupByLocalDay } from '../services/availability.service.js';
import {
  createAppointment,
  cancelAppointment,
  getAppointmentByToken,
  upsertClient,
} from '../services/booking.service.js';
import {
  joinWaitlist,
  leaveWaitlist,
  confirmOffer,
  declineOffer,
} from '../services/waitlist.service.js';
import { addMinutes } from '../lib/time.js';

const router = Router();

/** Resolve the shop. Single-tenant today; ?shop=slug keeps multi-tenant open. */
async function resolveBarber(req) {
  const slug = req.query.shop ?? req.body?.shop;
  const barber = slug
    ? await prisma.barber.findUnique({ where: { slug } })
    : await prisma.barber.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!barber) throw notFound('Shop not found');
  return barber;
}

// ------------------------------- Shop + menu -------------------------------

router.get(
  '/shop',
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    const rules = await prisma.workingHoursRule.findMany({ where: { barberId: barber.id, active: true } });
    res.json({
      id: barber.id,
      name: barber.name,
      slug: barber.slug,
      timezone: barber.timezone,
      addressLine: barber.addressLine,
      phone: barber.phone,
      email: barber.email, // the business contact, for the privacy and accessibility pages
      instagramUrl: barber.instagramUrl,
      wazeUrl: barber.wazeUrl,
      // Generated from the weekly schedule — the same shifts the booking
      // calendar is built from, so the two can never disagree.
      openingHours: summarizeRules(rules),
      vacationMode: barber.vacationMode,
      vacationMessage: barber.vacationMode ? barber.vacationMessage : null,
      paymentMethod: 'CASH_ON_SITE',
      offerTtlMin: barber.offerTtlMin,
      // Public rules, so the help page quotes the shop's real numbers.
      minLeadTimeMin: barber.minLeadTimeMin,
      maxMissedOffers: barber.maxMissedOffers,
    });
  })
);

router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    const services = await prisma.service.findMany({
      where: { barberId: barber.id, active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        currency: true,
        accentColor: true,
      },
    });
    res.json({ services });
  })
);

// ------------------------------- Availability ------------------------------

const availabilityQuery = z.object({
  serviceId: z.string().min(1),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  shop: z.string().optional(),
});

router.get(
  '/availability',
  validate(availabilityQuery, 'query'),
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    const from = req.query.from ?? new Date();
    const to = req.query.to ?? addMinutes(from, 14 * 24 * 60);

    const { slots } = await getAvailability({
      barberId: barber.id,
      serviceId: req.query.serviceId,
      from,
      to,
    });

    res.json({
      timezone: barber.timezone,
      days: groupByLocalDay(slots, barber.timezone),
      totalSlots: slots.length,
    });
  })
);

// -------------------------------- Bookings ---------------------------------

const clientSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(6).max(24),
  // Required: email is the automated channel — every confirmation and reminder.
  email: z.string().trim().toLowerCase().email().max(200),
  locale: z.string().length(2).optional(),
  // The unticked-by-default box: "email me when a slot frees up at the last minute".
  marketingOptIn: z.boolean().optional(),
});

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  startAt: z.coerce.date(),
  client: clientSchema,
  note: z.string().max(280).optional(),
  shop: z.string().optional(),
});

router.post(
  '/appointments',
  bookingIpLimiter,
  bookingPhoneLimiter,
  validate(bookingSchema),
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    const { appointment, service } = await createAppointment({
      barberId: barber.id,
      serviceId: req.body.serviceId,
      startAt: req.body.startAt,
      clientInput: req.body.client,
      clientNote: req.body.note,
    });

    res.status(201).json({
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        manageToken: appointment.manageToken,
        service: service.name,
        payment: 'CASH_ON_SITE',
      },
    });
  })
);

router.get(
  '/appointments/:token',
  asyncHandler(async (req, res) => {
    res.json({ appointment: await getAppointmentByToken(req.params.token) });
  })
);

router.post(
  '/appointments/:token/cancel',
  bookingIpLimiter,
  asyncHandler(async (req, res) => {
    // `waitlist` tells the UI whether the slot was instantly re-offered —
    // a nice touch for the confirmation screen.
    const result = await cancelAppointment({ manageToken: req.params.token });
    res.json(result);
  })
);

// -------------------------------- Waitlist ---------------------------------

const waitlistSchema = z.object({
  serviceId: z.string().min(1),
  client: clientSchema,
  earliestDate: z.coerce.date(),
  latestDate: z.coerce.date(),
  weekdayMask: z.number().int().min(1).max(127).default(127),
  timePref: z.enum(['ANY', 'MORNING', 'AFTERNOON', 'EVENING']).default('ANY'),
  shop: z.string().optional(),
});

router.post(
  '/waitlist',
  bookingIpLimiter,
  bookingPhoneLimiter,
  validate(waitlistSchema),
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    if (barber.vacationMode) throw conflict('SHOP_CLOSED', 'המספרה סגורה כרגע, נחזור בקרוב.');
    const client = await upsertClient(prisma, req.body.client);

    const { entry, position } = await joinWaitlist({
      barberId: barber.id,
      serviceId: req.body.serviceId,
      client,
      earliestDate: req.body.earliestDate,
      latestDate: req.body.latestDate,
      weekdayMask: req.body.weekdayMask,
      timePref: req.body.timePref,
    });

    res.status(201).json({
      waitlist: {
        manageToken: entry.manageToken,
        position,
        offerWindowMin: barber.offerTtlMin,
      },
    });
  })
);

router.get(
  '/waitlist/:token',
  asyncHandler(async (req, res) => {
    const entry = await prisma.waitlistEntry.findUnique({
      where: { manageToken: req.params.token },
      include: { service: { select: { name: true } } },
    });
    if (!entry) throw notFound('Waitlist entry not found');

    const ahead = await prisma.waitlistEntry.count({
      where: {
        barberId: entry.barberId,
        serviceId: entry.serviceId,
        status: 'ACTIVE',
        OR: [
          { priority: { gt: entry.priority } },
          { priority: entry.priority, createdAt: { lt: entry.createdAt } },
        ],
      },
    });

    res.json({
      status: entry.status,
      service: entry.service.name,
      position: ahead + 1,
      earliestDate: entry.earliestDate,
      latestDate: entry.latestDate,
      timePref: entry.timePref,
    });
  })
);

router.delete(
  '/waitlist/:token',
  bookingIpLimiter,
  asyncHandler(async (req, res) => {
    res.json(await leaveWaitlist(req.params.token));
  })
);

// ---------------------------- The offer screen -----------------------------

/**
 * The countdown page. `secondsRemaining` is computed here, from the stored
 * deadline, because the browser clock cannot be trusted — and because a client
 * refreshing at minute 14 must see 60 seconds, not a fresh 15 minutes.
 */
router.get(
  '/offers/:token',
  asyncHandler(async (req, res) => {
    const offer = await prisma.slotOffer.findUnique({
      where: { token: req.params.token },
      include: {
        barber: { select: { name: true, timezone: true, addressLine: true } },
        waitlistEntry: {
          include: {
            client: { select: { name: true } },
            service: { select: { name: true, durationMin: true, priceCents: true, currency: true } },
          },
        },
      },
    });
    if (!offer) throw notFound('Offer not found');

    const secondsRemaining = Math.max(
      0,
      Math.floor((offer.expiresAt.getTime() - Date.now()) / 1000)
    );

    res.json({
      status: secondsRemaining === 0 && offer.status === 'SENT' ? 'EXPIRED' : offer.status,
      slotStartAt: offer.slotStartAt,
      slotEndAt: offer.slotEndAt,
      expiresAt: offer.expiresAt,
      secondsRemaining,
      attemptNumber: offer.attemptNumber,
      clientName: offer.waitlistEntry.client.name,
      service: offer.waitlistEntry.service,
      barber: offer.barber,
      payment: 'CASH_ON_SITE',
    });
  })
);

router.post(
  '/offers/:token/confirm',
  bookingIpLimiter,
  asyncHandler(async (req, res) => {
    const { appointment, service } = await confirmOffer(req.params.token);
    res.json({
      ok: true,
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        manageToken: appointment.manageToken,
        service: service.name,
        payment: 'CASH_ON_SITE',
      },
    });
  })
);

router.post(
  '/offers/:token/decline',
  bookingIpLimiter,
  asyncHandler(async (req, res) => {
    res.json(await declineOffer(req.params.token));
  })
);

// --------------------------------- Gallery ---------------------------------

router.get(
  '/gallery',
  asyncHandler(async (req, res) => {
    const barber = await resolveBarber(req);
    const items = await prisma.galleryItem.findMany({
      where: { barberId: barber.id, published: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        beforeUrl: true,
        afterUrl: true,
        beforeBlurhash: true,
        afterBlurhash: true,
        caption: true,
        tags: true,
      },
    });
    res.json({ items });
  })
);

export default router;
