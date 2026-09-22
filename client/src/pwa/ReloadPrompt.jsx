import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRegisterSW } from 'virtual:pwa-register/react';

const EASE = [0.16, 1, 0.3, 1];
const HOUR = 60 * 60 * 1000;

/**
 * ===========================================================================
 *  גרסה חדשה — registers the service worker and offers updates
 * ===========================================================================
 *
 * Mounted once, at the root, so the worker registers on every route —
 * including /o/:token, often the very first page a client ever opens.
 *
 * A new version is OFFERED, never forced (registerType: 'prompt' in
 * vite.config.js): reloading on its own would throw away a half-typed booking.
 *
 * Long-lived tabs — the barber's dashboard stays open all day — look for a new
 * version hourly, and skip the check while offline, where it could only fail.
 */
export default function ReloadPrompt() {
  const reduce = useReducedMotion();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      window.setInterval(async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (res.status === 200) await registration.update();
        } catch {
          /* a blip — the next hour tries again */
        }
      }, HOUR);
    },
    onRegisterError(error) {
      console.warn('[pwa] service worker registration failed', error);
    },
  });

  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: 24 };

  function refresh() {
    // Hands the page to the waiting worker, which reloads it the moment it
    // takes control. The timer is a backstop for a page that somehow never
    // gets that signal; on the normal path the reload cancels it.
    updateServiceWorker(true);
    window.setTimeout(() => window.location.reload(), 3000);
  }

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          key="update"
          role="status"
          aria-live="polite"
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          exit={hidden}
          transition={{ duration: 0.5, ease: EASE }}
          className="catch fixed inset-x-3 z-[65] mx-auto max-w-sm"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <div className="glass flex items-center gap-3 py-3 pe-3 ps-4">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-pill bg-gold shadow-[0_0_12px_rgba(200,160,82,0.85)]"
            />
            <p className="min-w-0 flex-1 text-note text-ivory">גרסה חדשה של לוקסי מוכנה.</p>
            <button
              type="button"
              onClick={refresh}
              className="rounded-pill bg-gold px-4 py-2 text-note font-semibold text-onyx shadow-pop transition-[background-color,transform] duration-300 ease-lux hover:bg-gold-lit active:scale-[0.97]"
            >
              רענון
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              aria-label="אחר כך"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-pill text-pewter transition-colors duration-300 hover:text-ivory"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
