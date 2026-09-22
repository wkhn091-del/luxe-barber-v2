/**
 * Thin API client. No fetch wrapper library — the whole surface is nine calls,
 * and a shared error shape matters more than abstraction.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // The server's error codes (OFFER_EXPIRED, SLOT_TAKEN, ...) drive which
    // screen renders, so they're preserved rather than flattened to a string.
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'משהו השתבש. נסו שוב בעוד רגע.'
    );
  }
  return json;
}

export const api = {
  shop: () => request('/shop'),
  services: () => request('/services'),
  gallery: () => request('/gallery'),

  availability: (serviceId, from, to) =>
    request(
      `/availability?serviceId=${encodeURIComponent(serviceId)}` +
        (from ? `&from=${from.toISOString()}` : '') +
        (to ? `&to=${to.toISOString()}` : '')
    ),

  book: (payload) => request('/appointments', { method: 'POST', body: payload }),
  // The client's manage page (/b/:token): the token from their email is the key.
  appointment: (token) => request(`/appointments/${encodeURIComponent(token)}`),
  cancelAppointment: (token) => request(`/appointments/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: {} }),
  joinWaitlist: (payload) => request('/waitlist', { method: 'POST', body: payload }),

  offer: (token) => request(`/offers/${token}`),
  confirmOffer: (token) => request(`/offers/${token}/confirm`, { method: 'POST' }),
  declineOffer: (token) => request(`/offers/${token}/decline`, { method: 'POST' }),
};
