/**
 * ===========================================================================
 *  DEVICE-BOUND PIN AUTHENTICATION
 * ===========================================================================
 *
 * Threat model, stated plainly, because it determines every line below:
 *
 *   The PIN defends against a person who has the barber's unlocked phone.
 *   It does NOT defend against the internet. That job belongs to the device
 *   secret — 256 bits, minted only by a full email + password login, stored in
 *   the browser, and required on every unlock alongside the PIN.
 *
 * Consequences:
 *   - Brute-forcing six digits is pointless without first stealing the secret.
 *   - Lockout is per-device, which is the correct granularity: one compromised
 *     phone cannot lock the barber out of their laptop.
 *   - Ten failures revoke the device outright. Recovery is a full login, which
 *     is exactly the friction you want at that point.
 *
 * Two hash functions on purpose. bcrypt for the PIN, because low entropy has to
 * be expensive to test. SHA-256 for the secret, because 256 bits of entropy
 * needs no stretching and — unlike bcrypt, which salts per row — a plain hash
 * can be indexed, turning unlock into one query instead of a scan over every
 * device in the table.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { badRequest, unauthorized, forbidden, tooMany } from '../lib/errors.js';

const BCRYPT_ROUNDS = 12;

/**
 * Lockout ladder, in seconds, indexed by consecutive failures.
 *
 * The first three are free — people fat-finger a keypad, and punishing that
 * teaches the barber to distrust the tool. After that it climbs fast enough
 * that an online guessing attack is hopeless even if the secret leaked.
 */
const LOCKOUT_SECONDS = [0, 0, 0, 30, 120, 600, 1800, 3600, 3600, 3600];
const REVOKE_AFTER = 10;

// ---------------------------------------------------------------------------
// PIN quality
// ---------------------------------------------------------------------------

/**
 * A deliberately short denylist. Analyses of leaked PIN corpora put roughly a
 * quarter of real four-digit PINs in a handful of patterns — 1234 alone is
 * about one in ten. Blocking the patterns costs the barber nothing and removes
 * the only guesses worth making.
 */
const WEAK_PINS = new Set([
  '0000', '1111', '1234', '1212', '7777', '1004', '2000', '4444', '2222',
  '6969', '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321',
  '2001', '1010', '000000', '111111', '123456', '654321', '121212', '112233',
]);

export function assertStrongPin(pin) {
  if (!/^\d{4}$|^\d{6}$/.test(pin)) {
    throw badRequest('The PIN must be 4 or 6 digits.');
  }
  if (WEAK_PINS.has(pin)) {
    throw badRequest('That PIN is one of the most common ones. Pick another.');
  }
  if (new Set(pin).size === 1) {
    throw badRequest('Use more than one digit.');
  }

  // Runs in either direction — 3456, 8765 and the like.
  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  if (ascending || descending) {
    throw badRequest('Consecutive digits are too easy to guess.');
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const hashSecret = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

function issueSession(user, deviceId = null) {
  return jwt.sign(
    { sub: user.id, barberId: user.barberId, role: user.role, did: deviceId },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

/**
 * Register this browser and set its PIN. Requires an already-authenticated
 * session, i.e. the barber has just typed their email and password.
 *
 * The secret is returned exactly once. It is never recoverable afterwards —
 * only its hash is stored — so a lost phone means enrolling again, which is
 * the correct outcome.
 */
export async function enrolDevice({ adminUserId, pin, label }) {
  assertStrongPin(pin);

  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!user?.active) throw unauthorized();

  // Keep the fleet small enough that the barber can actually recognise the
  // entries in their device list.
  const existing = await prisma.adminDevice.count({
    where: { adminUserId, revokedAt: null },
  });
  if (existing >= 5) {
    throw badRequest('You have five devices registered. Remove one before adding another.');
  }

  const secret = crypto.randomBytes(32).toString('base64url');

  const device = await prisma.adminDevice.create({
    data: {
      adminUserId,
      label: (label ?? 'Phone').slice(0, 40),
      pinHash: await bcrypt.hash(pin, BCRYPT_ROUNDS),
      secretHash: hashSecret(secret),
      lastSeenAt: new Date(),
    },
  });

  logger.info('admin device enrolled', { adminUserId, deviceId: device.id });

  return {
    deviceId: device.id,
    deviceSecret: secret, // shown once, then gone
    label: device.label,
  };
}

// ---------------------------------------------------------------------------
// Unlock
// ---------------------------------------------------------------------------

/**
 * Exchange (deviceId + deviceSecret + PIN) for a session token.
 *
 * Order matters. The secret is checked first and a bad one is indistinguishable
 * from an unknown device — neither burns a PIN attempt, because an attacker
 * guessing secrets must not be able to lock the barber out of their own phone.
 */
export async function unlockWithPin({ deviceId, deviceSecret, pin }) {
  if (!deviceId || !deviceSecret || !/^\d{4,6}$/.test(pin ?? '')) {
    throw unauthorized('Incorrect PIN.');
  }

  const device = await prisma.adminDevice.findUnique({
    where: { id: deviceId },
    include: { adminUser: true },
  });

  const expected = device ? Buffer.from(device.secretHash, 'hex') : null;
  const provided = Buffer.from(hashSecret(deviceSecret), 'hex');

  // Constant-time, and the length guard keeps timingSafeEqual from throwing on
  // a malformed input.
  const secretOk =
    expected && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

  if (!device || !secretOk || device.revokedAt || !device.adminUser.active) {
    throw forbidden('This device is no longer registered. Sign in with your email.');
  }

  if (device.lockedUntil && device.lockedUntil > new Date()) {
    const seconds = Math.ceil((device.lockedUntil - Date.now()) / 1000);
    throw tooMany(`Too many attempts. Try again in ${formatWait(seconds)}.`);
  }

  if (!(await bcrypt.compare(pin, device.pinHash))) {
    return recordFailure(device);
  }

  await prisma.adminDevice.update({
    where: { id: device.id },
    data: { failedAttempts: 0, lockedUntil: null, lastSeenAt: new Date() },
  });

  return {
    token: issueSession(device.adminUser, device.id),
    barberId: device.adminUser.barberId,
    role: device.adminUser.role,
  };
}

async function recordFailure(device) {
  const attempts = device.failedAttempts + 1;

  if (attempts >= REVOKE_AFTER) {
    await prisma.adminDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date(), failedAttempts: attempts },
    });
    logger.warn('admin device revoked after repeated PIN failures', { deviceId: device.id });
    throw forbidden('This device has been locked out. Sign in with your email to set it up again.');
  }

  const wait = LOCKOUT_SECONDS[Math.min(attempts, LOCKOUT_SECONDS.length - 1)];
  await prisma.adminDevice.update({
    where: { id: device.id },
    data: {
      failedAttempts: attempts,
      lockedUntil: wait ? new Date(Date.now() + wait * 1000) : null,
    },
  });

  // Tell the barber how many tries remain. Hiding it doesn't slow an attacker
  // down — they can count — and it does stop an honest person being surprised
  // by a revocation.
  const remaining = REVOKE_AFTER - attempts;
  throw unauthorized(
    wait
      ? `Incorrect PIN. Try again in ${formatWait(wait)}. ${remaining} attempts left.`
      : `Incorrect PIN. ${remaining} attempts left.`
  );
}

const formatWait = (seconds) =>
  seconds < 60
    ? `${seconds} seconds`
    : `${Math.ceil(seconds / 60)} minute${seconds >= 120 ? 's' : ''}`;

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

export async function changePin({ adminUserId, deviceId, currentPin, newPin }) {
  assertStrongPin(newPin);

  const device = await prisma.adminDevice.findFirst({
    where: { id: deviceId, adminUserId, revokedAt: null },
  });
  if (!device) throw forbidden('Device not found.');
  if (!(await bcrypt.compare(currentPin, device.pinHash))) {
    throw unauthorized('That PIN is not correct.');
  }

  await prisma.adminDevice.update({
    where: { id: device.id },
    data: { pinHash: await bcrypt.hash(newPin, BCRYPT_ROUNDS), failedAttempts: 0, lockedUntil: null },
  });
  return { ok: true };
}

export async function listDevices(adminUserId) {
  const devices = await prisma.adminDevice.findMany({
    where: { adminUserId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, lastSeenAt: true, createdAt: true, lockedUntil: true },
  });
  return devices;
}

/** Revoking is a soft delete so the audit trail survives a lost phone. */
export async function revokeDevice({ adminUserId, deviceId }) {
  const { count } = await prisma.adminDevice.updateMany({
    where: { id: deviceId, adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw forbidden('Device not found.');
  logger.info('admin device revoked', { adminUserId, deviceId });
  return { ok: true };
}

export { issueSession };
