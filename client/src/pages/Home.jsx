import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import HeroScene from '../components/HeroScene.jsx';
import BookingSheet from '../components/booking/BookingSheet.jsx';
import { Num, Price, themeFor, SHOP_TZ, TimesText } from '../lib/bidi.jsx';
import { api } from '../lib/api.js';
import InstallPrompt from '../pwa/InstallPrompt.jsx';
import { Link } from 'react-router-dom';
import { displayPhone, wazeFor } from '../lib/phone.js';

/**
 * ===========================================================================
 *  HOME — הדף הראשי
 * ===========================================================================
 *
 * Two layers, one scroll.
 *
 *   z-0   a fixed, full-viewport canvas. Never scrolls, never unmounts.
 *   z-10  a normal scrolling document of cards over it.
 *
 * THE RULE THAT MAKES THEM COEXIST: the scroll layer is `.pass-through`
 * (pointer-events: none) and only controls opt back in with `.catch`. Drop it
 * and the overlay swallows every pointer event, the 3D stops following the
 * cursor, and nothing in the console tells you why.
 *
 * ---------------------------------------------------------------------------
 * The menu is the point of this page
 * ---------------------------------------------------------------------------
 * The old menu was a grid of near-identical translucent rectangles — every card
 * the same colour, the price the same size as the description, and no visible
 * way to act on any of it. Four changes fix that, and together they are also
 * what makes the page colourful:
 *
 *   1. EACH SERVICE OWNS A COLOUR, stable by index. Colour becomes the thing
 *      you scan, so you find "the beard one" without reading.
 *   2. THE PRICE IS THE BIGGEST THING ON THE CARD. It is the question
 *      everybody actually has.
 *   3. EVERY CARD HAS ITS OWN BUTTON in its own colour. The old version relied
 *      on the whole card being tappable, which is invisible.
 *   4. CARDS ARE OPAQUE WHITE, not frosted. Frosted glass under a paragraph of
 *      Hebrew is genuinely harder to read, and legibility beats the effect.
 *      The glass is kept for the chrome around them, where there is no body
 *      text to fight.
 */

// Written, not translated. Short clauses, no marketing verbs.
const COPY = {
  brand: 'לוקסי',
  nav: { menu: 'התפריט', visit: 'איפה אנחנו', book: 'לקביעת תור', help: 'שאלות נפוצות' },
  closed: { title: 'המספרה סגורה כרגע, נחזור בקרוב', nav: 'סגור כרגע', card: 'סגור זמנית', note: 'קביעת תורים באתר תיפתח מחדש כשנחזור.' },
  hero: {
    badge: 'כיסא אחד · בתיאום מראש',
    lines: ['תספורת טובה,', 'בלי להמתין בתור.'],
    body: 'בוחרים טיפול, בוחרים שעה, מגיעים. אם השבוע מלא — נכנסים לרשימה ומקבלים הודעה ברגע שמתפנה מקום.',
    primary: 'לקביעת תור',
    secondary: 'לראות מחירים',
  },
  services: {
    title: 'בחרו טיפול',
    lede: 'כל המחירים סופיים וכוללים מע״מ. משלמים במזומן במקום.',
    empty: 'התפריט מתעדכן כרגע. נסו שוב בעוד רגע.',
    error: 'לא הצלחנו לטעון את התפריט.',
    retry: 'לנסות שוב',
    book: 'לקביעת תור',
    duration: 'משך',
    popular: 'הכי מבוקש',
  },
  waitlist: {
    title: 'השבוע מלא?',
    body: 'נכנסים לרשימת ההמתנה ושוכחים מזה. ברגע שמתפנה מקום נשלחת הודעה, והתור שמור לכם ל־15 דקות לפני שהוא עובר הלאה.',
    steps: [
      { t: 'נכנסים לרשימה', d: 'בוחרים אילו ימים ושעות מתאימים לכם.' },
      { t: 'מקבלים הודעה', d: 'ברגע שמישהו מבטל, אתם הראשונים לדעת.' },
      { t: 'מאשרים תוך 15 דקות', d: 'התור שמור לכם עד אז. לחיצה אחת וזהו.' },
    ],
    cta: 'להצטרף לרשימה',
  },
  visit: {
    title: 'איפה אנחנו',
    address: 'רחוב לילינבלום 24, תל אביב',
    phone: '03-000-0000',
    call: 'להתקשר',
  },
};

// Entrance direction MIRRORS in RTL: content enters from the leading edge,
// which is the RIGHT, so x animates from POSITIVE to zero. A left-to-right
// entrance under Hebrew reads as content being shoved backwards — the tell
// that a layout was designed LTR and flipped afterwards.
const LEAD = 26;
const EASE = [0.16, 1, 0.3, 1];

const rise = (delay = 0, reduced = false) => ({
  initial: reduced ? { opacity: 0 } : { opacity: 0, y: 24, x: LEAD },
  whileInView: { opacity: 1, y: 0, x: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.9, delay, ease: EASE },
});

/**
 * Three states, not two. `loading` and `empty` need completely different UI —
 * skeletons in one case, a real message in the other. Collapsing them is why so
 * many pages flash grey boxes and then nothing.
 *
 * A failure never takes the page down: the 3D is the first impression and does
 * not depend on this request, so an error resolves to a retry inside the menu
 * while the scene keeps running behind it.
 */
function useServices() {
  const [state, setState] = useState({ status: 'loading', services: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));

    api
      .services()
      .then((d) => {
        if (cancelled) return;
        const services = d.services ?? [];
        setState({ status: services.length ? 'ready' : 'empty', services });
      })
      .catch(() => !cancelled && setState({ status: 'error', services: [] }));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

export default function Home() {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState(null);
  const [booking, setBooking] = useState(null);
  const { status, services, retry } = useServices();

  useEffect(() => {
    let cancelled = false;
    api
      .shop()
      .then((s) => !cancelled && setShop(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // מצב חופשה: every way into booking leads to the notice instead. (The
  // server refuses bookings too — this is the courtesy, not the lock.)
  const closed = Boolean(shop?.vacationMode);
  const showClosed = () =>
    document.getElementById('closed')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  const book = (service) => (closed ? showClosed() : setBooking(service));
  const openFirst = () => book([...services].sort((a, b) => a.durationMin - b.durationMin)[0] ?? null);

  return (
    <div dir="rtl" className="relative">
      {/* ---------- LAYER 0 — the toolkit ---------- */}
      {/* Fixed, not sticky. A sticky canvas re-composites on every scroll tick
          on iOS, which shows up as a visible seam under the overlay. */}
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <HeroScene onReady={() => setReady(true)} />
      </div>

      {/* The room darkens below the fold, so the content sections sit on
          something calm instead of competing with a spinning pole. The hero
          stays clear. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(to bottom, rgba(11,17,16,0) 0%, rgba(11,17,16,0) 38%, rgba(11,17,16,0.86) 72%, rgba(11,17,16,0.97) 100%)',
        }}
      />

      <Preloader ready={ready} />
      <InstallPrompt />

      {/* ---------- LAYER 10 — the page ---------- */}
      <div className="pass-through grain relative z-10">
        <Nav onBook={openFirst} closed={closed} />
        <Hero reduced={reduced} onBook={openFirst} closed={closed} />
        {closed && <ClosedNotice shop={shop} reduced={reduced} />}
        <Menu
          reduced={reduced}
          status={status}
          services={services}
          retry={retry}
          onPick={book}
          closed={closed}
        />
        {!closed && <Waitlist reduced={reduced} onBook={openFirst} />}
        <Visit reduced={reduced} shop={shop} />
      </div>

      {/* Booking opens OVER the scene rather than navigating away, so the
          WebGL context is never torn down and rebuilt. */}
      <BookingSheet
        open={Boolean(booking) && !closed}
        service={booking}
        shop={shop}
        onClose={() => setBooking(null)}
      />
    </div>
  );
}

/**
 * The veil. It lifts on the scene's first DRAWN frame, not on a timer and not
 * on asset progress — the first frame that actually renders the pole is the
 * expensive one, and hiding the loader before it lands turns the reveal into a
 * stutter.
 */
function Preloader({ ready }) {
  return (
    <AnimatePresence>
      {!ready && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-cream"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <div className="text-center">
            <motion.p
              className="font-display text-d3 font-semibold text-espresso"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              {COPY.brand}
            </motion.p>
            {/* The brand's three colours, breathing in sequence. */}
            <div className="mt-6 flex justify-center gap-1.5">
              {['bg-pomegranate', 'bg-citrus', 'bg-azure'].map((c, i) => (
                <motion.span
                  key={c}
                  className={`h-1.5 w-1.5 rounded-full ${c}`}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Nav({ onBook, closed }) {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 140], ['rgba(11,17,16,0)', 'rgba(11,17,16,0.82)']);
  const shadow = useTransform(scrollY, [0, 140], ['0 0 0 rgba(0,0,0,0)', '0 1px 0 rgba(200,160,82,0.18), 0 10px 30px -16px rgba(0,0,0,0.9)']);

  return (
    <motion.header
      style={{ backgroundColor: bg, boxShadow: shadow }}
      className="catch pt-safe fixed inset-x-0 top-0 z-30 backdrop-blur-md"
    >
      {/* justify-between with logical flow puts the brand at the start — which
          in RTL is the right. Hard-coding left/right is what breaks mirrored
          layouts. */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          {/* A tiny barber pole as the mark. */}
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ring-2 ring-white">
            <span
              className="h-full w-full"
              style={{
                background:
                  'repeating-linear-gradient(135deg, #C0352F 0 4px, #EFE6D6 4px 8px, #2A5DB5 8px 12px, #EFE6D6 12px 16px)',
              }}
            />
          </span>
          <span className="font-display text-lead font-semibold text-espresso">{COPY.brand}</span>
        </a>

        <div className="flex items-center gap-5">
          <Link to="/help" className="hidden text-note text-cocoa transition-colors duration-300 hover:text-espresso sm:block">
            {COPY.nav.help}
          </Link>
          <a href="#menu" className="hidden text-note text-cocoa transition-colors duration-300 hover:text-espresso sm:block">
            {COPY.nav.menu}
          </a>
          {/* On a phone the text links are hidden; the questions keep a door. */}
          <Link
            to="/help"
            aria-label={COPY.nav.help}
            className="grid h-9 w-9 place-items-center rounded-pill border border-line text-note font-semibold text-gold-lit sm:hidden"
          >
            ?
          </Link>
          <button
            type="button"
            onClick={onBook}
            className="rounded-pill bg-espresso px-5 py-2 text-note font-semibold text-cream shadow-pop transition-transform duration-300 ease-lux active:scale-[0.97]"
          >
            {closed ? COPY.closed.nav : COPY.nav.book}
          </button>
        </div>
      </nav>
    </motion.header>
  );
}

function Hero({ reduced, onBook, closed }) {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 0.16], [0, -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  return (
    <section id="top" className="flex min-h-[100svh] items-center px-5 pt-20 sm:px-8">
      <motion.div style={reduced ? undefined : { y, opacity }} className="mx-auto w-full max-w-6xl">
        {/* A pill badge rather than a tracked-out uppercase eyebrow. Hebrew has
            no capitals, so that convention cannot exist here — faking it is the
            clearest tell of an LTR design flipped afterwards. */}
        <motion.span
          className="catch inline-flex items-center gap-2 rounded-pill bg-white/80 px-4 py-1.5 text-micro font-semibold text-cocoa shadow-pop backdrop-blur"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          {COPY.hero.badge}
        </motion.span>

        <h1 className="mt-6 font-display text-d1 font-semibold text-espresso">
          {COPY.hero.lines.map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: '0.7em' }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.32 + i * 0.12, ease: EASE }}
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.div
          className="mt-8 max-w-lg"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.72, ease: EASE }}
        >
          <p className="he-body text-lead text-cocoa">{COPY.hero.body}</p>

          <div className="catch mt-8 flex flex-wrap items-center gap-3">
            {closed ? (
              <button
                type="button"
                onClick={onBook}
                className="inline-flex items-center gap-2.5 rounded-pill border-2 border-pomegranate/60 bg-onyx/60 px-6 py-3.5 text-base font-semibold text-pomegranate backdrop-blur"
              >
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-pill bg-pomegranate" />
                {COPY.closed.title}
              </button>
            ) : (
              <button
                type="button"
                onClick={onBook}
                className="rounded-pill bg-pomegranate px-8 py-4 text-base font-semibold text-white shadow-lift transition-[transform,background-color] duration-300 ease-lux hover:bg-pomegranate-deep active:scale-[0.98]"
              >
                {COPY.hero.primary}
              </button>
            )}
            <a
              href="#menu"
              className="rounded-pill border-2 border-sand bg-white/70 px-7 py-3.5 text-base font-semibold text-espresso backdrop-blur transition-colors duration-300 hover:border-espresso"
            >
              {COPY.hero.secondary}
            </a>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/** Four flat glyphs, one per service slot. Drawn rather than emoji, so they
 *  inherit the service's colour and stay crisp at any size. */
const ICONS = [
  // scissors
  <>
    <circle cx="6" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </>,
  // razor
  <>
    <path d="M4 20h7a4 4 0 0 0 4-4V4l5 5v7a8 8 0 0 1-8 8H4z" />
    <path d="M4 20V9l5-5" />
  </>,
  // comb
  <>
    <rect x="3" y="4" width="18" height="4" rx="1.5" />
    <path d="M6 8v11M10 8v11M14 8v11M18 8v11" />
  </>,
  // beard / face
  <>
    <path d="M5 4v7a7 7 0 0 0 14 0V4" />
    <path d="M9 12v1a3 3 0 0 0 6 0v-1" />
  </>,
];

function Menu({ reduced, status, services, retry, onPick, closed }) {
  return (
    <section id="menu" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <motion.div {...rise(0, reduced)}>
          <h2 className="font-display text-d2 font-semibold text-espresso">{COPY.services.title}</h2>
          <p className="he-body mt-3 max-w-xl text-lead text-cocoa">{COPY.services.lede}</p>
        </motion.div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {status === 'loading' &&
              [0, 1, 2, 3].map((i) => (
                <motion.div
                  key={`sk-${i}`}
                  className="card relative h-[268px] overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.25 } }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                >
                  {/* Skeletons match the real card's height exactly, so nothing
                      reflows when the data lands. */}
                  <div className={`h-1.5 w-full ${themeFor(i).bar} opacity-30`} />
                  <div className="p-7">
                    <div className="h-12 w-12 rounded-pill bg-sand/60" />
                    <div className="mt-5 h-6 w-44 rounded bg-sand/60" />
                    <div className="mt-3 h-4 w-56 rounded bg-sand/40" />
                    <div className="mt-8 h-12 w-full rounded-pill bg-sand/40" />
                  </div>
                  {/* Sweeps right to left — a left-to-right shimmer under
                      Hebrew reads backwards. */}
                  <div className="absolute inset-y-0 w-1/2 animate-sweep-rtl bg-gradient-to-l from-transparent via-white/70 to-transparent" />
                </motion.div>
              ))}

            {status === 'ready' &&
              services.map((service, i) => (
                <ServiceCard key={service.id} service={service} index={i} reduced={reduced} onPick={onPick} closed={closed} />
              ))}
          </AnimatePresence>
        </div>

        {(status === 'error' || status === 'empty') && (
          <motion.div
            className="card mt-8 p-10 text-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="text-lead text-espresso">
              {status === 'error' ? COPY.services.error : COPY.services.empty}
            </p>
            {status === 'error' && (
              <button
                type="button"
                onClick={retry}
                className="catch mt-6 rounded-pill bg-espresso px-7 py-3 text-note font-semibold text-cream"
              >
                {COPY.services.retry}
              </button>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}

/**
 * One service, in its own colour.
 *
 * The hierarchy is deliberate and top-to-bottom: colour bar → icon → name →
 * description → a divider → duration and price on one line with the price
 * doubled in size → a full-width button in the service's colour.
 *
 * The price is the largest element because it is the question everybody
 * actually has, and burying it at note-size next to the duration was the main
 * reason the old menu read as unclear.
 */
function ServiceCard({ service, index, reduced, onPick, closed }) {
  const theme = themeFor(index);
  const icon = ICONS[index % ICONS.length];

  return (
    <motion.div
      layout
      className="card catch group flex flex-col overflow-hidden"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, x: LEAD }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
      transition={{ duration: 0.75, delay: index * 0.07, ease: EASE }}
      whileHover={reduced ? undefined : { y: -5 }}
    >
      {/* The colour bar. The single strongest scanning cue on the page. */}
      <div className={`h-1.5 w-full ${theme.bar}`} />

      <div className="flex flex-1 flex-col p-7">
        <div className="flex items-start justify-between gap-4">
          <span className={`flex h-12 w-12 items-center justify-center rounded-pill ${theme.soft}`}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={theme.text}
              aria-hidden="true"
            >
              {icon}
            </svg>
          </span>

          {index === 0 && (
            <span className={`rounded-pill ${theme.soft} ${theme.text} px-3 py-1 text-micro font-semibold`}>
              {COPY.services.popular}
            </span>
          )}
        </div>

        <h3 className="mt-5 font-display text-d3 font-semibold text-espresso">{service.name}</h3>
        {service.description && (
          <p className="he-body mt-2 text-note text-cocoa">{service.description}</p>
        )}

        <div className="mt-6 flex items-end justify-between gap-4 border-t border-sand pt-5">
          <span className="rounded-pill bg-shell px-3.5 py-1.5 text-micro font-semibold text-cocoa">
            {COPY.services.duration} <Num>{service.durationMin}</Num> דק׳
          </span>
          {/* Always shekels — see the note on Price in lib/bidi.jsx. */}
          <Price cents={service.priceCents} className={`text-price font-semibold ${theme.text}`} />
        </div>

        <button
          type="button"
          onClick={() => onPick(service)}
          aria-disabled={closed || undefined}
          className={
            closed
              ? 'mt-5 w-full rounded-pill border-2 border-sand py-3.5 text-base font-semibold text-haze'
              : `mt-5 w-full rounded-pill ${theme.btn} py-3.5 text-base font-semibold text-white shadow-pop transition-[transform,background-color] duration-300 ease-lux active:scale-[0.98]`
          }
        >
          {closed ? COPY.closed.card : COPY.services.book}
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The waitlist, explained as three numbered steps.
 *
 * This is the hardest idea in the product to grasp from a sentence — "we hold
 * it for fifteen minutes, then it moves on" — so it gets the one numbered
 * sequence on the page. Numbers earn their place here because the steps really
 * do happen in order.
 */
function Waitlist({ reduced, onBook }) {
  const themes = ['bg-azure', 'bg-citrus', 'bg-mint'];

  return (
    <section id="waitlist" className="px-5 pb-24 sm:px-8 sm:pb-32">
      <div className="mx-auto max-w-5xl">
        <motion.div {...rise(0, reduced)} className="card overflow-hidden">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
            <div>
              <h2 className="font-display text-d2 font-semibold text-espresso">{COPY.waitlist.title}</h2>
              <p className="he-body mt-4 text-lead text-cocoa">{COPY.waitlist.body}</p>
              <button
                type="button"
                onClick={onBook}
                className="catch mt-8 rounded-pill bg-espresso px-8 py-4 text-base font-semibold text-cream shadow-lift transition-transform duration-300 ease-lux active:scale-[0.98]"
              >
                {COPY.waitlist.cta}
              </button>
            </div>

            <ol className="space-y-5">
              {COPY.waitlist.steps.map((step, i) => (
                <li key={step.t} className="flex gap-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${themes[i]} text-note font-semibold text-white`}
                  >
                    <Num>{i + 1}</Num>
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-espresso">{step.t}</span>
                    <span className="he-body mt-1 block text-note text-cocoa">{step.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </motion.div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// מצב חופשה
// ---------------------------------------------------------------------------

/** Shown right under the hero while the shop is closed; every booking button scrolls here. */
function ClosedNotice({ shop, reduced }) {
  const phone = shop?.phone ? displayPhone(shop.phone) : null;
  return (
    <section id="closed" className="scroll-mt-24 px-5 py-14 sm:px-8">
      <motion.div {...rise(0, reduced)} className="glass catch mx-auto max-w-2xl rounded-sheet px-6 py-10 text-center sm:px-10">
        <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-pomegranate/15 text-pomegranate">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-5 font-display text-d2 font-semibold leading-tight text-espresso">{COPY.closed.title}</h2>
        {shop?.vacationMessage && <p className="he-body mx-auto mt-4 max-w-md text-lead text-cocoa">{shop.vacationMessage}</p>}
        <p className="mt-3 text-note text-haze">{COPY.closed.note}</p>
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            className="catch mt-7 inline-flex items-center gap-2 rounded-pill border-2 border-sand px-6 py-3 text-base font-semibold text-espresso transition-colors duration-300 hover:border-cocoa/40"
          >
            לשאלות <Num>{phone}</Num>
          </a>
        )}
      </motion.div>
    </section>
  );
}
function Visit({ reduced, shop }) {
  // The admin's settings, read live — a change there shows here on the next visit.
  const phone = shop?.phone ? displayPhone(shop.phone) : COPY.visit.phone;
  const waze = wazeFor(shop);
  // שעות פעילות — free text from the admin, one line per row.
  const hours = (shop?.openingHours ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <section id="visit" className="px-5 pb-32 sm:px-8">
      <motion.div {...rise(0, reduced)} className="mx-auto max-w-5xl">
        <div className="glass p-8 sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-d3 font-semibold text-espresso">{COPY.visit.title}</h2>
              <p className="mt-3 text-base text-cocoa">{shop?.addressLine ?? COPY.visit.address}</p>
              {/* From the admin (פרטי העסק → שעות פעילות). Hidden when empty:
                  no invented hours on a live site. */}
              {hours.length > 0 && (
                <p className="mt-1 text-note text-cocoa">
                  {hours.map((line, i) => (
                    <TimesText key={i} text={line} className="block" />
                  ))}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {waze && (
                <a
                  href={waze}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="catch inline-flex items-center justify-center gap-2 rounded-pill border-2 border-sand px-7 py-3.5 text-base font-semibold text-espresso transition-colors duration-300 hover:border-cocoa/40"
                >
                  ניווט ב־Waze
                </a>
              )}
              <a
                href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                className="catch inline-flex items-center justify-center gap-2 rounded-pill bg-white px-7 py-3.5 text-base font-semibold text-espresso shadow-pop"
              >
                {COPY.visit.call} <Num>{phone}</Num>
              </a>
            </div>
          </div>
        </div>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-micro text-haze">
          <span>
            {COPY.brand} · <Num>{new Date().getFullYear()}</Num>
          </span>
          <span aria-hidden="true">·</span>
          {/* catch: the page layer ignores the pointer (so the 3D can follow
              the mouse) — every link on it has to opt back in. */}
          <Link to="/help" className="catch underline decoration-haze/40 underline-offset-4 transition-colors duration-300 hover:text-cocoa">
            {COPY.nav.help}
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="catch underline decoration-haze/40 underline-offset-4 transition-colors duration-300 hover:text-cocoa">
            מדיניות פרטיות
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/accessibility" className="catch underline decoration-haze/40 underline-offset-4 transition-colors duration-300 hover:text-cocoa">
            הצהרת נגישות
          </Link>
        </p>
      </motion.div>
    </section>
  );
}

export { SHOP_TZ };
