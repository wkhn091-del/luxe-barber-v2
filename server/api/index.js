/**
 * Vercel serverless entry point.
 *
 * The Express app is exported as a handler instead of calling listen(). Note
 * that `startScheduler()` is deliberately NOT called here: a serverless
 * container freezes between invocations, so a setInterval would never fire
 * reliably. Set ENABLE_SCHEDULER=false and let the cron in vercel.json drive
 * POST /api/internal/sweep instead.
 */
import { createApp } from '../src/app.js';

export default createApp();
