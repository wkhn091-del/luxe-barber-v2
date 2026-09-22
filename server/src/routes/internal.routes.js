/**
 * Internal routes. Protected by a shared secret, not a JWT — the caller is a
 * cron scheduler, not a person.
 */
import { Router } from 'express';
import { requireCronSecret } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import { runSweep } from '../jobs/sweeper.js';

const router = Router();

/**
 * The Vercel Cron / Render Cron entry point.
 *
 * Runs exactly the same tick as the in-process scheduler, so behaviour is
 * identical whichever way it is driven:
 *
 *   vercel.json → { "crons": [{ "path": "/api/internal/sweep", "schedule": "* * * * *" }] }
 *
 * GET and POST both run it. Vercel Cron only ever sends GET, with the secret
 * as a Bearer token; POST stays for curl and every other scheduler.
 *
 * Idempotent and single-flight, so overlapping invocations are harmless.
 */
const sweep = asyncHandler(async (_req, res) => {
  res.json(await runSweep());
});

router.get('/sweep', requireCronSecret, sweep);
router.post('/sweep', requireCronSecret, sweep);

export default router;
