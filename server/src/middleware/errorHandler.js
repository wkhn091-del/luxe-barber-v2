import { AppError, isSlotCollision } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, _next) {
  if (isSlotCollision(err)) {
    return res.status(409).json({
      error: { code: 'SLOT_TAKEN', message: 'That slot has just been taken.' },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Prisma: unique constraint.
  if (err?.code === 'P2002') {
    return res.status(409).json({
      error: { code: 'DUPLICATE', message: 'That record already exists.' },
    });
  }

  logger.error('unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: isProd ? undefined : err.stack,
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: isProd ? 'Something went wrong.' : err.message,
    },
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}
