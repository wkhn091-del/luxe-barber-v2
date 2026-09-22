/**
 * "Remember me" for the booking form: name, phone and email kept on THIS
 * device only (localStorage — never a cookie, never sent anywhere), so a
 * returning client books in two taps.
 *
 * Saved only after a booking succeeds, and only when the box is ticked; the
 * "not you?" link wipes it — the escape hatch for a shared family phone.
 */
const KEY = 'luxe.client.v1';

export function loadRemembered() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    return { name: String(saved.name ?? ''), phone: String(saved.phone ?? ''), email: String(saved.email ?? '') };
  } catch {
    return null; // private mode, storage full, a hand-edited value: just start empty
  }
}

export function remember({ name, phone, email }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim(), savedAt: Date.now() }));
  } catch {
    /* nothing to do: the booking itself already succeeded */
  }
}

export function forget() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
