/**
 * Services CRUD. Mounted at /api/admin/services behind requireAdmin.
 *
 * Prices cross the wire in cents, never floats — 45.10 is not representable in
 * binary floating point and a rounding error in a price list is the kind of bug
 * that shows up as a fifty-cent discrepancy six months later.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate, asyncHandler } from '../middleware/validate.js';
import {
  listServices,
  createService,
  updateService,
  removeService,
  reorderServices,
  estimateFitsPerWeek,
} from '../services/service.service.js';
import { getWorkingHours } from '../services/schedule.service.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const serviceBody = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(200).optional(),
  durationMin: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).max(1_000_000),
  currency: z.string().length(3).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      services: await listServices(req.auth.barberId, { includeInactive: true }),
    });
  })
);

/**
 * How many of a given duration fit in the week, and whether it lands on the
 * slot grid. The editor calls this as the barber drags the duration, so the
 * consequence is visible before they save rather than a week later.
 */
router.get(
  '/capacity',
  asyncHandler(async (req, res) => {
    const durationMin = Number(req.query.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 5) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'durationMin must be a whole number of minutes.' },
      });
    }

    const [barber, rules] = await Promise.all([
      prisma.barber.findUniqueOrThrow({ where: { id: req.auth.barberId } }),
      getWorkingHours(req.auth.barberId),
    ]);

    return res.json(
      estimateFitsPerWeek({
        rules,
        durationMin,
        bufferMin: barber.bufferMin,
        granularityMin: barber.slotGranularityMin,
      })
    );
  })
);

router.post(
  '/',
  validate(serviceBody),
  asyncHandler(async (req, res) => {
    res.status(201).json({ service: await createService(req.auth.barberId, req.body) });
  })
);

router.patch(
  '/:id',
  validate(serviceBody.partial().extend({ active: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    res.json(await updateService(req.auth.barberId, req.params.id, req.body));
  })
);

/** Deletes if never booked; retires (active = false) if it has history. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await removeService(req.auth.barberId, req.params.id));
  })
);

router.put(
  '/order',
  validate(z.object({ ids: z.array(z.string()).min(1).max(50) })),
  asyncHandler(async (req, res) => {
    res.json(await reorderServices(req.auth.barberId, req.body.ids));
  })
);

export default router;
