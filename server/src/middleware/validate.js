import { badRequest } from '../lib/errors.js';

/**
 * Zod validation middleware. Replaces req[source] with the PARSED value, so
 * handlers receive coerced types (Dates, numbers) rather than raw strings.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(
      badRequest(
        'Validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      )
    );
  }
  req[source] = result.data;
  return next();
};

/** Wrap async handlers so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
