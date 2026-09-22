/**
 * Admin client.
 *
 * Every message in here is read by the barber, so every message is in Hebrew.
 * The server also returns Hebrew-safe messages of its own (attempt counts,
 * lockout durations); those are passed through untouched rather than
 * second-guessed, because the server knows things this layer does not.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Three pieces of state, deliberately stored differently.
 *
 *   deviceId + deviceSecret  localStorage, permanent. This is what makes the
 *                            barber "stay logged in" — the browser keeps proof
 *                            that this phone is enrolled, indefinitely, until
 *                            they revoke it.
 *   token                    localStorage, but short-lived (12h server-side).
 *                            When it expires the barber sees the PIN pad, not
 *                            the email form. That's the difference between an
 *                            app that feels signed in and one that nags.
 *
 * A 401 with an enrolled device means "unlock", not "sign in". Only a 403 —
 * device revoked or unknown — sends them back to email and password.
 */
const TOKEN_KEY = 'luxe.admin.token';
const DEVICE_KEY = 'luxe.admin.device';

let token = localStorage.getItem(TOKEN_KEY) ?? null;
let onLocked = () => {};
let onSignedOut = () => {};

function readDevice() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export const adminAuth = {
  get token() {
    return token;
  },
  get device() {
    return readDevice();
  },
  get enrolled() {
    return Boolean(readDevice()?.deviceId);
  },

  setToken(value) {
    token = value;
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },

  /** Called once, straight after enrolment. The secret is never shown again. */
  setDevice({ deviceId, deviceSecret, label }) {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ deviceId, deviceSecret, label }));
  },

  /** Lock the screen but keep the device enrolled — the PIN gets back in. */
  lock() {
    adminAuth.setToken(null);
    onLocked();
  },

  /** Forget everything. Next visit starts at email and password. */
  forget() {
    adminAuth.setToken(null);
    localStorage.removeItem(DEVICE_KEY);
    onSignedOut();
  },

  on({ locked, signedOut }) {
    if (locked) onLocked = locked;
    if (signedOut) onSignedOut = signedOut;
  },
};

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 = the token aged out. If this phone is enrolled, that's a PIN away.
  if (res.status === 401) {
    if (adminAuth.enrolled) {
      adminAuth.lock();
      throw new Error('נעול. הזינו קוד.');
    }
    adminAuth.forget();
    throw new Error('פג תוקף החיבור. התחברו מחדש.');
  }

  // 403 on an admin route means the device itself is no longer trusted.
  if (res.status === 403 && path.startsWith('/auth')) {
    adminAuth.forget();
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(json?.error?.message ?? 'משהו השתבש. נסו שוב.');
    err.code = json?.error?.code;
    // The block-time endpoint returns the conflicting appointments alongside
    // the 409 so the UI can show them rather than just refusing.
    err.details = json?.error?.details ?? json?.conflicts;
    throw err;
  }
  return json;
}

export const admin = {
  // --- auth ---
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  enrolDevice: (pin, label) => request('/auth/devices', { method: 'POST', body: { pin, label } }),
  unlock: (pin) => {
    const device = adminAuth.device;
    if (!device) throw new Error('המכשיר הזה עדיין לא מוגדר.');
    return request('/auth/pin', {
      method: 'POST',
      body: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, pin },
    });
  },
  changePin: (currentPin, newPin) =>
    request('/auth/pin/change', {
      method: 'POST',
      body: { deviceId: adminAuth.device?.deviceId, currentPin, newPin },
    }),
  devices: () => request('/auth/devices'),
  revokeDevice: (id) => request(`/auth/devices/${id}`, { method: 'DELETE' }),

  me: () => request('/me'),

  // --- services ---
  services: () => request('/services'),
  capacity: (durationMin) => request(`/services/capacity?durationMin=${durationMin}`),
  createService: (body) => request('/services', { method: 'POST', body }),
  updateService: (id, body) => request(`/services/${id}`, { method: 'PATCH', body }),
  deleteService: (id) => request(`/services/${id}`, { method: 'DELETE' }),
  reorderServices: (ids) => request('/services/order', { method: 'PUT', body: { ids } }),

  workingHours: () => request('/working-hours'),
  setWorkingHours: (rules) => request('/working-hours', { method: 'PUT', body: { rules } }),

  appointments: (from, to) =>
    request(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`),
  setAppointmentStatus: (id, status) =>
    request(`/appointments/${id}`, { method: 'PATCH', body: { status } }),

  exceptions: (from, to) =>
    request(`/schedule-exceptions?from=${from.toISOString()}&to=${to.toISOString()}`),

  /** kind OPEN adds hours and immediately offers them to the waitlist. */
  openHours: (startAt, endAt, note) =>
    request('/schedule-exceptions', {
      method: 'POST',
      body: { kind: 'OPEN', startAt, endAt, note },
    }),

  /** Refuses with 409 HAS_APPOINTMENTS unless force — see blockTime() in step 2. */
  blockHours: (startAt, endAt, note, force = false) =>
    request('/schedule-exceptions', {
      method: 'POST',
      body: { kind: 'BLOCK', startAt, endAt, note, force },
    }),

  removeException: (id) => request(`/schedule-exceptions/${id}`, { method: 'DELETE' }),

  waitlist: () => request('/waitlist'),
  promote: (id, startAt, endAt) =>
    request(`/waitlist/${id}/promote`, { method: 'POST', body: { startAt, endAt } }),

  flashSuggestions: () => request('/flash-slots/suggestions'),
  flash: (startAt, endAt, message) =>
    request('/flash-slots', { method: 'POST', body: { startAt, endAt, message } }),

  gallery: () => request('/gallery'),
  addGalleryItem: (payload) => request('/gallery', { method: 'POST', body: payload }),
  updateGalleryItem: (id, payload) => request(`/gallery/${id}`, { method: 'PATCH', body: payload }),
  deleteGalleryItem: (id) => request(`/gallery/${id}`, { method: 'DELETE' }),

  stats: () => request('/stats'),

  // Clean-up: deleting is silent — no message to the client, no waitlist offer.
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),
  clients: (q = '') => request(`/clients?q=${encodeURIComponent(q)}`),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),

  // Business details the public site, emails and WhatsApp read.
  exportLink: () => request('/export/link', { method: 'POST', body: {} }),
  calendarFeed: () => request('/calendar-feed'),
  resetCalendarFeed: () => request('/calendar-feed/reset', { method: 'POST', body: {} }),
  sheetFeed: () => request('/sheet-feed'),
  resetSheetFeed: () => request('/sheet-feed/reset', { method: 'POST', body: {} }),
  settings: () => request('/settings'),
  updateSettings: (body) => request('/settings', { method: 'PATCH', body }),

};
