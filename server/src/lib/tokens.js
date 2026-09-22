import crypto from 'node:crypto';

/**
 * URL-safe, unguessable public token (~128 bits).
 * Used for confirm links (/o/<token>) and manage links — these are capability
 * URLs sent over SMS, so they must not be enumerable.
 */
export function publicToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}
