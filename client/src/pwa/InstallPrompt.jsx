import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { promptInstall, requestInstall, snooze, useInstall } from './install.js';

const EASE = [0.16, 1, 0.3, 1];

/**
 * ===========================================================================
 *  לוקסי במסך הבית — the install card
 * ===========================================================================
 *
 *  - NOT ON FIRST PAINT. An install ask before anyone has seen the app gets a
 *    reflex "no". The card waits `delay` ms — long enough to have looked at
 *    the menu — and appears only where installing is actually possible.
 *  - ONE "NO" LASTS TWO WEEKS. "לא עכשיו", the ✕, or dismissing the browser's
 *    own dialog all snooze it for 14 days. Once installed: never again.
 *  - IT SAYS HOW. Android gets a real button that opens the system dialog.
 *    iOS has no such dialog anywhere, so there the card shows the two steps
 *    through the Share sheet instead of a button that could never work.
 *
 * Mount it once on the public pages. For a permanent entry point — a footer
 * or a menu — use <InstallButton />, which renders only where it can work.
 * `auto={false}` keeps the card from appearing on its own: it then opens only
 * when an <InstallButton> on the same page asks (the iOS instructions).
 */
export default function InstallPrompt({ delay = 15000, auto = true }) {
  const { platform, snoozed, requested } = useInstall();
  const [timeUp, setTimeUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!auto) return undefined;
    const id = window.setTimeout(() => setTimeUp(true), delay);
    return () => window.clearTimeout(id);
  }, [delay, auto]);

  const installable = platform === 'prompt' || platform === 'ios';
  const open = installable && (requested || (timeUp && !snoozed));
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: 32 };

  async function install() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="install"
          aria-labelledby="install-title"
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          exit={hidden}
          transition={{ duration: 0.6, ease: EASE }}
          className="catch fixed inset-x-3 z-40 sm:inset-x-auto sm:end-6 sm:w-[23.5rem]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <div className="glass p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              {/* The real icon, so they see exactly what lands on the home screen. */}
              <img
                src="/icons/maskable-192.png"
                alt=""
                width="56"
                height="56"
                className="h-14 w-14 shrink-0 rounded-[15px] shadow-pop ring-1 ring-gold/25"
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="install-title" className="text-base font-semibold text-ivory">
                  לוקסי במסך הבית
                </h2>
                <p className="he-body mt-1 text-note text-champagne">
                  {platform === 'ios'
                    ? 'שתי נגיעות, והתור הבא שלכם במרחק לחיצה.'
                    : 'קביעת תור בלחיצה אחת, ישר ממסך הבית — בלי לחפש את האתר.'}
                </p>
              </div>
              <button
                type="button"
                onClick={snooze}
                aria-label="סגירה"
                className="-me-1.5 -mt-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-pill text-pewter transition-colors duration-300 hover:text-ivory"
              >
                <CloseIcon />
              </button>
            </div>

            {platform === 'ios' ? (
              <>
                <ol className="mt-4 space-y-3 rounded-plate border border-line bg-onyx/60 px-4 py-3.5">
                  <Step n={1}>
                    לוחצים על <Glyph><ShareIcon /></Glyph> <strong className="font-semibold">שיתוף</strong>
                    <span className="mt-0.5 block text-micro text-pewter">לא רואים אותו? הוא בתפריט ···</span>
                  </Step>
                  <Step n={2}>
                    בוחרים <Glyph><AddIcon /></Glyph> <strong className="font-semibold">הוספה למסך הבית</strong>
                  </Step>
                </ol>
                <button
                  type="button"
                  onClick={snooze}
                  className="mt-4 w-full rounded-pill border border-line py-3 text-note font-semibold text-ivory transition-colors duration-300 hover:border-gold/60"
                >
                  הבנתי
                </button>
              </>
            ) : (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={install}
                  disabled={busy}
                  className="flex-1 rounded-pill bg-gold py-3 text-note font-semibold text-onyx shadow-pop transition-[background-color,transform] duration-300 ease-lux hover:bg-gold-lit active:scale-[0.98] disabled:opacity-60"
                >
                  {busy ? 'רגע…' : 'התקנת האפליקציה'}
                </button>
                <button
                  type="button"
                  onClick={snooze}
                  className="rounded-pill px-4 py-3 text-note font-semibold text-champagne transition-colors duration-300 hover:text-ivory"
                >
                  לא עכשיו
                </button>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/**
 * A quiet, permanent entry point for a footer or a menu. Renders nothing
 * where installing is impossible or already done, so it can be placed
 * unconditionally. On iOS it opens the instruction card — which means
 * <InstallPrompt /> must be mounted on the same page.
 */
export function InstallButton({ className = '' }) {
  const { platform } = useInstall();
  if (platform !== 'prompt' && platform !== 'ios') return null;

  return (
    <button
      type="button"
      onClick={() => (platform === 'prompt' ? promptInstall() : requestInstall())}
      className={[
        'inline-flex items-center gap-2 rounded-pill border border-gold/40 px-4 py-2 text-note font-semibold text-gold-lit',
        'transition-colors duration-300 ease-lux hover:border-gold hover:text-ivory',
        className,
      ].join(' ')}
    >
      <PhoneIcon />
      התקנת האפליקציה
    </button>
  );
}

function Step({ n, children }) {
  return (
    <li className="flex items-start gap-3 text-note text-ivory">
      <span className="figures mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-pill bg-gold/15 text-micro text-gold-lit">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** The inline chip that stands in for the system button being described. */
function Glyph({ children }) {
  return (
    <span className="mx-0.5 inline-grid h-6 w-6 place-items-center rounded-md bg-graphite align-[-0.4em] text-gold-lit">
      {children}
    </span>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v6.5M9.25 11.5 12 14.25l2.75-2.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
