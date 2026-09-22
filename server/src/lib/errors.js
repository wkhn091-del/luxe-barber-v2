/** Typed application errors → clean HTTP responses. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (code, msg) => new AppError(409, code, msg);
export const gone = (code, msg) => new AppError(410, code, msg);
export const tooMany = (msg = 'Too many requests') => new AppError(429, 'RATE_LIMITED', msg);

/** Postgres SQLSTATE for an exclusion-constraint violation. */
export const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * The exclusion constraint is our concurrency control, so a violation is an
 * expected, meaningful outcome ("someone beat you to it") rather than a bug.
 */
export function isSlotCollision(err) {
  return (
    err?.code === 'P2010' && err?.meta?.code === PG_EXCLUSION_VIOLATION
  ) ||
    err?.code === PG_EXCLUSION_VIOLATION ||
    /appointment_no_overlap/.test(err?.message ?? '');
}
