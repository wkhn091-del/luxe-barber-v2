import { useSyncExternalStore } from 'react';

/**
 * ===========================================================================
 *  INSTALL — can this device put לוקסי on its home screen, and how?
 * ===========================================================================
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once, early —
 * often before React has mounted anything. A listener added in a component's
 * effect misses it, and the install button silently never appears. So the
 * event is caught HERE, the moment this module loads, and components read it
 * from this store.
 *
 * iOS never fires it. Safari — and, since iOS 16.4, every iOS browser —
 * installs from the Share sheet, so on iOS the prompt becomes instructions.
 *
 *   platform  'prompt'       the browser can show its own install dialog
 *             'ios'          show the two Share-sheet steps
 *             'installed'    running as the app, or installed from this browser
 *             'unsupported'  in-app browsers (Instagram, Facebook, TikTok…),
 *                            desktop Firefox and anything else that can't
 */

const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const KEY_SNOOZED = 'luxe.install.snoozedAt';
const KEY_INSTALLED = 'luxe.install.installed';

// Storage throws in some private modes. Then a snooze lasts for this page's
// life only — the honest fallback, rather than asking again on every screen.
const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* see above */
  }
};

// In-app browsers can't install anything; offering would be a dead end.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Bytedance|Snapchat|LinkedInApp/i;

let deferredPrompt = null;
let installedNow = false;
let snoozedNow = false;
let requested = false; // an <InstallButton> asked for the card: skip the wait

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS 13+ presents itself as a Mac; its touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function platform() {
  if (isStandalone()) return 'installed';
  if (IN_APP.test(navigator.userAgent)) return 'unsupported';
  // The browser's word beats our stored flag: if it offers the prompt, the
  // app is not installed (any more) on this device.
  if (deferredPrompt) return 'prompt';
  if (installedNow || read(KEY_INSTALLED)) return 'installed';
  if (isIOS()) return 'ios';
  return 'unsupported';
}

function compute() {
  const snoozedAt = Number(read(KEY_SNOOZED)) || 0;
  return {
    platform: platform(),
    snoozed: snoozedNow || Date.now() - snoozedAt < SNOOZE_MS,
    requested,
  };
}

const SERVER = { platform: 'unsupported', snoozed: true, requested: false };
const listeners = new Set();
let snapshot = typeof window === 'undefined' ? SERVER : compute();

function emit() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeps Chrome's own mini-infobar away; the card asks instead, later and
    // in Hebrew.
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    requested = false;
    write(KEY_INSTALLED, '1');
    emit();
  });
}

/** Opens the browser's own install dialog. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return 'unavailable';

  // One event, one prompt: the browser refuses a second call on the same
  // event, so it is spent the moment it is used.
  deferredPrompt = null;
  requested = false;
  emit();

  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome !== 'accepted') snooze();
  return outcome;
}

/** "לא עכשיו": quiet for two weeks. */
export function snooze() {
  snoozedNow = true;
  requested = false;
  write(KEY_SNOOZED, String(Date.now()));
  emit();
}

/** An explicit ask from an <InstallButton>: show the card now, snooze or not. */
export function requestInstall() {
  requested = true;
  emit();
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** @returns {{ platform: 'prompt'|'ios'|'installed'|'unsupported', snoozed: boolean, requested: boolean }} */
export function useInstall() {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}
