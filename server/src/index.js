import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startScheduler } from './jobs/sweeper.js';
import { verifyMailer, closeMailer } from './services/mailer.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`API listening on :${env.PORT}`, { env: env.NODE_ENV });
  // A wrong App Password belongs in the deploy log, not in the silence after
  // the first booking. Never fatal — mail waits in the outbox until it's fixed.
  verifyMailer();
  // One line that says which build is live — the first thing to check when
  // "the fix isn't working" (Render sets RENDER_GIT_COMMIT on every deploy).
  console.log(
    `${new Date().toISOString()} [boot] build ${process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local'} · ` +
      'reminders: 24h + 1h, only if booked before the reminder moment'
  );
});

// Slow-client protection (slowloris): a connection that trickles its headers
// or body in is cut off instead of holding a socket open for minutes. Every
// real request to this API finishes in well under these.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;

// The Smart VIP Waitlist heartbeat. Disable on serverless and use cron instead.
const timer = startScheduler();

/** Finish in-flight requests before the container is killed. */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  if (timer) clearInterval(timer);
  closeMailer();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
