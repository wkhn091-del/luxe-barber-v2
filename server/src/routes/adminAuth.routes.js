/**
 * Admin authentication. Mounted at /api/admin/auth BEFORE the main admin
 * router, so these paths resolve here and never reach the JWT guard.
 *
 * Rate limits are the second line of defence behind the device secret, and
 * they're per-IP rather than per-account on purpose: locking an account from
 * unauthenticated traffic is a denial-of-service hole, not a protection.
 */
import { Router } from 'express';
import { loginLimiter, pinLimiter } from '../middleware/security.js';
import { z } from 'zod';
import { validate, asyncHandler } from '../middleware/validate.js';
import { requireAdmin, login } from '../middleware/auth.js';
import {
  enrolDevice,
  unlockWithPin,
  changePin,
  listDevices,
  revokeDevice,
} from '../services/auth.service.js';

const router = Router();

// loginLimiter and pinLimiter live in middleware/security.js, with every other
// limit, so the numbers can be read (and changed) in one place.

/** Full sign-in. Required before a device can be enrolled. */
router.post(
  '/login',
  loginLimiter,
  validate(z.object({ email: z.string().email(), password: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    res.json(await login(req.body));
  })
);

/**
 * Register this browser and set its PIN.
 * Returns the device secret exactly once — it is never recoverable.
 */
router.post(
  '/devices',
  requireAdmin,
  validate(
    z.object({
      pin: z.string().regex(/^\d{4}$|^\d{6}$/, 'The PIN must be 4 or 6 digits.'),
      label: z.string().max(40).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await enrolDevice({
      adminUserId: req.auth.userId,
      pin: req.body.pin,
      label: req.body.label,
    });
    res.status(201).json(result);
  })
);

/** PIN unlock: device secret + PIN in, session token out. */
router.post(
  '/pin',
  pinLimiter,
  validate(
    z.object({
      deviceId: z.string().min(1),
      deviceSecret: z.string().min(1),
      pin: z.string().regex(/^\d{4,6}$/),
    })
  ),
  asyncHandler(async (req, res) => {
    res.json(await unlockWithPin(req.body));
  })
);

router.post(
  '/pin/change',
  requireAdmin,
  validate(
    z.object({
      deviceId: z.string().min(1),
      currentPin: z.string().regex(/^\d{4,6}$/),
      newPin: z.string().regex(/^\d{4}$|^\d{6}$/),
    })
  ),
  asyncHandler(async (req, res) => {
    res.json(await changePin({ adminUserId: req.auth.userId, ...req.body }));
  })
);

router.get(
  '/devices',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ devices: await listDevices(req.auth.userId) });
  })
);

router.delete(
  '/devices/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await revokeDevice({ adminUserId: req.auth.userId, deviceId: req.params.id }));
  })
);

export default router;
