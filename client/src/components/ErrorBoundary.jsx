import { Component } from 'react';

/**
 * ===========================================================================
 *  ErrorBoundary — when a screen crashes, the shop stays open
 * ===========================================================================
 *
 * An uncaught render error makes React unmount the whole tree, which on this
 * site means a black page with nothing on it. This catches it and shows a calm
 * Hebrew page instead: what happened, the one button that fixes it almost
 * every time, and — folded away — the exact error and the component it came
 * from, for whoever has to fix it.
 *
 * Deliberately self-contained: plain Tailwind classes, no motion, no router,
 * no 3D. A fallback must not depend on anything that might be the very thing
 * that just crashed.
 *
 * React's rules, not ours: it does NOT catch errors in event handlers, timers
 * or promises — those never reach render. The booking sheet already turns
 * those into inline messages.
 */

// The page was loaded before a deploy and now asks for a code chunk that no
// longer exists. Not a bug: a reload fetches the new build and fixes it.
const STALE_BUILD =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i;

const MAX_STACK_LINES = 14;

const trimStack = (stack = '') =>
  stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_STACK_LINES)
    .join('\n');

/**
 * "BookingSheet — http://…/BookingSheet.jsx:212:9", from React's component
 * stack. Plain elements (div, bdi, details) head the stack with no source
 * location, so the first frame that HAS one is the component that crashed.
 */
function firstComponent(stack = '') {
  const frames = stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => /^(?:at|in)\s+([^\s(]+)(?:\s+\((.+)\))?/.exec(l))
    .filter(Boolean);
  const located = frames.find((m) => m[2]);
  if (located) return `${located[1]} — ${located[2]}`;
  return frames[0]?.[1] ?? '';
}

export default class ErrorBoundary extends Component {
  state = { error: null, componentStack: '', at: null, copied: null };

  static getDerivedStateFromError(error) {
    return { error: error instanceof Error ? error : new Error(String(error)), at: new Date() };
  }

  componentDidCatch(error, info) {
    const componentStack = info?.componentStack ?? '';
    this.setState({ componentStack });
    // One structured line, so it can be found in the browser console or in
    // any log collector added later.
    console.error('[ui] render crash', {
      message: error?.message,
      path: window.location.pathname,
      component: firstComponent(componentStack),
    });
  }

  report() {
    const { error, componentStack, at } = this.state;
    return [
      `זמן: ${at?.toISOString()}`,
      `כתובת: ${window.location.href}`,
      `דפדפן: ${navigator.userAgent}`,
      '',
      `${error.name}: ${error.message}`,
      '',
      'Component stack:',
      trimStack(componentStack),
      '',
      'JS stack:',
      trimStack(error.stack),
    ].join('\n');
  }

  copy = async () => {
    try {
      await navigator.clipboard.writeText(this.report());
      this.setState({ copied: 'ok' });
    } catch {
      // No clipboard (an insecure origin, or permission denied). The details
      // are on screen, so they can still be selected by hand.
      this.setState({ copied: 'failed' });
    }
  };

  render() {
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;

    const stale = STALE_BUILD.test(`${error.name} ${error.message}`);
    const where = firstComponent(componentStack);

    return (
      <main dir="rtl" role="alert" className="grid min-h-[100dvh] place-items-center bg-onyx px-5 py-10">
        <div className="glass w-full max-w-lg p-6 sm:p-8">
          <img src="/favicon.svg" alt="" width="48" height="48" className="h-12 w-12" />

          <h1 className="mt-5 font-display text-d3 font-semibold text-ivory">
            {stale ? 'עלתה גרסה חדשה' : 'משהו השתבש בדף הזה'}
          </h1>
          <p className="he-body mt-3 text-base text-champagne">
            {stale
              ? 'האתר התעדכן בזמן שהדף היה פתוח. רענון יטען את הגרסה החדשה.'
              : 'התקלה אצלנו, לא אצלכם. רענון מתקן את זה כמעט תמיד — ואם לא, חזרו לדף הבית או כתבו לנו.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-pill bg-gold px-6 py-3 text-note font-semibold text-onyx shadow-pop transition-[background-color,transform] duration-300 ease-lux hover:bg-gold-lit active:scale-[0.98]"
            >
              רענון הדף
            </button>
            <a
              href="/"
              className="rounded-pill border border-line px-6 py-3 text-note font-semibold text-ivory transition-colors duration-300 hover:border-gold/60"
            >
              לדף הבית
            </a>
          </div>

          {/* For whoever fixes it. Closed by default: a client should see an
              apology, not a stack trace — but the details are one tap away. */}
          <details className="group mt-7 rounded-plate border border-line bg-onyx/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-note font-semibold text-champagne [&::-webkit-details-marker]:hidden">
              פרטים טכניים
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-gold-lit transition-transform duration-300 ease-lux group-open:rotate-180"
              >
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            <div className="border-t border-line px-4 py-4">
              <dl className="grid gap-2 text-micro">
                <Detail label="שגיאה">
                  {error.name}: {error.message}
                </Detail>
                {where && <Detail label="רכיב">{where}</Detail>}
                <Detail label="כתובת">{window.location.pathname}</Detail>
              </dl>

              <pre
                dir="ltr"
                className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-onyx p-3 text-left font-mono text-[11px] leading-relaxed text-pewter"
              >
                {trimStack(componentStack) || trimStack(error.stack)}
              </pre>

              <button
                type="button"
                onClick={this.copy}
                className="mt-3 rounded-pill border border-gold/40 px-4 py-2 text-micro font-semibold text-gold-lit transition-colors duration-300 hover:border-gold hover:text-ivory"
              >
                {copied === 'ok' ? 'הועתק ✓' : 'העתקת פרטי התקלה'}
              </button>
              {copied === 'failed' && (
                <p className="mt-2 text-micro text-pewter">ההעתקה נחסמה בדפדפן — אפשר לסמן את הטקסט ולהעתיק ידנית.</p>
              )}
            </div>
          </details>
        </div>
      </main>
    );
  }
}

function Detail({ label, children }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="text-pewter">{label}</dt>
      <dd dir="ltr" className="min-w-0 break-words text-left font-mono text-ivory">
        {children}
      </dd>
    </div>
  );
}
