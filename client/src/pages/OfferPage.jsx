import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import HeroScene from '../components/HeroScene.jsx';
import { api, ApiError } from '../lib/api.js';
import { Num, Price, SlotTime, SHOP_TZ } from '../lib/bidi.jsx';

/**
 * ===========================================================================
 *  מסך ההצעה — the 15-minute offer
 * ===========================================================================
 *
 * Someone is standing somewhere with a phone and has a quarter of an hour to
 * decide. The screen has one job and shows one number.
 *
 * ---------------------------------------------------------------------------
 * URGENCY IN A COLOURFUL PALETTE
 * ---------------------------------------------------------------------------
 * In the old dark build, red was the ONLY saturated colour in the product and
 * it appeared here and nowhere else — so a red digit meant something.
 *
 * That discipline cannot survive a palette where the barber pole is red. So
 * urgency stops being a HUE and becomes a STATE: under sixty seconds the whole
 * card inverts to solid pomegranate with cream type. A card that changes state
 * reads as alarm far more strongly than a red number on a white page ever
 * could, and it works in a world where red is also just a colour.
 *
 * ---------------------------------------------------------------------------
 * The clock
 * ---------------------------------------------------------------------------
 *  1. IT IS THE SERVER'S. `secondsRemaining` becomes an absolute deadline once,
 *     then every tick recomputes from Date.now(). Decrementing a counter
 *     drifts, because setInterval is not a clock — and a phone five minutes
 *     fast must not see five minutes less than the backend will enforce.
 *  2. IT RE-SYNCS ON WAKE. Background tabs throttle timers to once a minute; a
 *     locked phone stops them dead. This screen exists for someone who opened
 *     an SMS, got distracted and came back.
 *  3. EXPIRY IS NOT AN ERROR. It is a state with its own screen, and that
 *     screen says the useful thing: you are still on the list.
 */

const EASE = [0.16, 1, 0.3, 1];

const COPY = {
  opened: (name) => `${name}, התפנה תור.`,
  cash: 'מזומן במקום',
  holding: 'התור שמור לכם עד שייגמר הזמן.',
  hurry: 'אשרו עכשיו — עוד רגע התור עובר הלאה.',
  take: 'לקחת את התור',
  taking: 'מאשרים…',
  decline: 'לא מתאים לי הפעם',
  remaining: 'נותר לכם',
  confirmed: { title: 'התור שלכם', payment: 'תשלום', where: 'כתובת', service: 'טיפול', sms: 'שלחנו אישור בהודעה.' },
  expired: { title: 'התור נתפס', body: 'הוא עבר לבא בתור. אתם עדיין ברשימה — נעדכן ברגע שמתפנה מקום נוסף.' },
  passed: { title: 'עבר הלאה', body: 'תודה שעדכנתם מהר — מישהו אחר יכול לקחת אותו עכשיו. שמרתם על המקום שלכם ברשימה.' },
  missing: { title: 'לא מצאנו את ההצעה', body: 'ייתכן שהקישור לא הועתק במלואו. בדקו את ההודעה ששלחנו.' },
  home: 'חזרה לאתר',
};

function useCountdown(secondsRemaining, onExpire) {
  const deadline = useRef(null);
  const fired = useRef(false);
  const [remaining, setRemaining] = useState(secondsRemaining ?? 0);

  useEffect(() => {
    if (secondsRemaining == null) return;
    deadline.current = Date.now() + secondsRemaining * 1000;
    fired.current = false;
    setRemaining(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining == null) return undefined;

    const tick = () => {
      if (!deadline.current) return;
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };

    // 250ms, not 1000: the displayed second turns over within a quarter of a
    // second of the real one, so the number never looks stuck.
    const id = setInterval(tick, 250);
    const wake = () => tick();

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    tick();

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [secondsRemaining, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {
    remaining,
    minutes,
    seconds,
    label: `${minutes}:${String(seconds).padStart(2, '0')}`,
    critical: remaining > 0 && remaining <= 60,
    urgent: remaining > 0 && remaining <= 120,
  };
}

export default function OfferPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const reduced = useReducedMotion();

  const [offer, setOffer] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const buzzed = useRef({ minute: false, ten: false });

  useEffect(() => {
    let cancelled = false;
    api
      .offer(token)
      .then((data) => {
        if (cancelled) return;
        setOffer(data);
        if (data.status === 'CONFIRMED') setPhase('confirmed');
        else if (data.status === 'SENT' && data.secondsRemaining > 0) setPhase('live');
        else if (data.status === 'DECLINED') setPhase('passed');
        else setPhase('expired');
      })
      .catch(() => !cancelled && setPhase('missing'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onExpire = useCallback(() => setPhase('expired'), []);
  const clock = useCountdown(phase === 'live' ? offer?.secondsRemaining : null, onExpire);

  // A short buzz at one minute and at ten seconds. Guarded — iOS Safari has no
  // vibrate API, and this must never be the thing that throws.
  useEffect(() => {
    if (phase !== 'live' || !navigator.vibrate) return;
    if (clock.remaining <= 60 && !buzzed.current.minute) {
      buzzed.current.minute = true;
      navigator.vibrate(18);
    }
    if (clock.remaining <= 10 && !buzzed.current.ten) {
      buzzed.current.ten = true;
      navigator.vibrate([12, 60, 12]);
    }
  }, [clock.remaining, phase]);

  const decline = useCallback(async () => {
    setPhase('working');
    try {
      await api.declineOffer(token);
      setPhase('passed');
    } catch {
      setPhase('expired');
    }
  }, [token]);

  // The decline deep-link in the WhatsApp message lands here with ?decline=1.
  useEffect(() => {
    if (params.get('decline') === '1' && phase === 'live') decline();
  }, [phase, params, decline]);

  async function confirm() {
    setPhase('working');
    setError(null);
    try {
      const result = await api.confirmOffer(token);
      navigator.vibrate?.([10, 40, 20]);
      setOffer((prev) => ({ ...prev, appointment: result.appointment }));
      setPhase('confirmed');
    } catch (err) {
      // 410 means the sweeper got there first. Not a failure to explain away —
      // show the expired screen, which already says what happens next.
      if (err instanceof ApiError && err.status === 410) return setPhase('expired');
      setError(err.message);
      setPhase('live');
    }
  }

  return (
    <Shell reduced={reduced}>
      <AnimatePresence mode="wait">
        {phase === 'loading' && <Pulse key="loading" />}
        {phase === 'missing' && <Message key="missing" {...COPY.missing} />}
        {phase === 'expired' && <Message key="expired" {...COPY.expired} />}
        {phase === 'passed' && <Message key="passed" {...COPY.passed} />}
        {phase === 'confirmed' && <Confirmed key="confirmed" offer={offer} />}
        {(phase === 'live' || phase === 'working') && (
          <Live
            key="live"
            offer={offer}
            clock={clock}
            working={phase === 'working'}
            error={error}
            onConfirm={confirm}
            onDecline={decline}
            reduced={reduced}
          />
        )}
      </AnimatePresence>
    </Shell>
  );
}

/**
 * The same toolkit as the home page, pushed right back.
 *
 * Brand continuity matters, but this is a single-decision screen — a spinning
 * pole behind the one number that counts would be actively unhelpful. So the
 * scene sits at a quarter opacity under a cream wash: present enough to feel
 * like the same product, quiet enough to ignore. Reduced motion drops it.
 */
function Shell({ children, reduced }) {
  return (
    <div dir="rtl" className="relative min-h-[100dvh] bg-cream">
      {!reduced && (
        <div className="fixed inset-0 z-0 opacity-25" aria-hidden="true">
          <HeroScene />
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{ background: 'radial-gradient(120% 90% at 50% 40%, rgba(11,17,16,0.45) 0%, rgba(11,17,16,0.94) 72%)' }}
      />
      <main className="grain relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-16">
        {children}
      </main>
    </div>
  );
}

function Live({ offer, clock, working, error, onConfirm, onDecline, reduced }) {
  const tz = offer.barber?.timezone && offer.barber.timezone !== 'Europe/Paris' ? offer.barber.timezone : SHOP_TZ;

  // THE STATE CHANGE. Under sixty seconds the card inverts entirely.
  const hot = clock.critical;

  return (
    <motion.div
      className="w-full max-w-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <motion.div
        className={[
          'overflow-hidden rounded-glass p-8 shadow-lift transition-colors duration-600 ease-lux sm:p-10',
          hot ? 'bg-pomegranate' : 'bg-white',
        ].join(' ')}
        animate={hot && !reduced ? { scale: [1, 1.012, 1] } : { scale: 1 }}
        transition={{ duration: 1.6, repeat: hot ? Infinity : 0, ease: 'easeInOut' }}
      >
        <p className={`text-note ${hot ? 'text-white/85' : 'text-cocoa'}`}>
          {COPY.opened(offer.clientName)}
        </p>

        <h1 className={`mt-3 font-display text-d3 font-semibold ${hot ? 'text-white' : 'text-espresso'}`}>
          <SlotTime iso={offer.slotStartAt} tz={tz} />
        </h1>

        <div className={`mt-6 flex items-baseline justify-between border-t pt-5 ${hot ? 'border-white/25' : 'border-sand'}`}>
          <span className={`text-base font-semibold ${hot ? 'text-white' : 'text-espresso'}`}>
            {offer.service.name}
          </span>
          <Price
            cents={offer.service.priceCents}
            className={`text-price font-semibold ${hot ? 'text-white' : 'text-pomegranate-deep'}`}
          />
        </div>
        <div className={`mt-2 flex items-baseline justify-between text-note ${hot ? 'text-white/80' : 'text-cocoa'}`}>
          <span>
            <Num>{offer.service.durationMin}</Num> דקות
          </span>
          <span>{COPY.cash}</span>
        </div>

        <Clock clock={clock} total={offer.secondsRemaining} hot={hot} reduced={reduced} />

        <p className={`mt-5 text-center text-note ${hot ? 'text-white' : 'text-cocoa'}`}>
          {hot ? COPY.hurry : COPY.holding}
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-plate bg-white/90 px-4 py-3 text-center text-note text-pomegranate-deep">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={working}
          className={[
            'mt-7 w-full rounded-pill py-4 text-base font-semibold shadow-pop',
            'transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-60',
            hot ? 'bg-white text-pomegranate-deep' : 'bg-pomegranate text-white hover:bg-pomegranate-deep',
          ].join(' ')}
        >
          {working ? COPY.taking : COPY.take}
        </button>

        {/* Declining is offered as plainly as confirming. Per the backend it
            costs no missed-offer penalty and cascades instantly, so an easy
            "no" is worth more to the shop than the conversion squeezed out of
            burying it — and it is honest to the person who cannot come. */}
        <button
          type="button"
          onClick={onDecline}
          disabled={working}
          className={[
            'mt-3 w-full py-2 text-note underline-offset-4 transition-colors duration-300 hover:underline',
            hot ? 'text-white/85 hover:text-white' : 'text-cocoa hover:text-espresso',
          ].join(' ')}
        >
          {COPY.decline}
        </button>
      </motion.div>
    </motion.div>
  );
}

/** A draining ring and the digits. stroke-dashoffset is compositor-only, so the
 *  ring animates without touching layout. */
function Clock({ clock, total, hot, reduced }) {
  const R = 78;
  const C = 2 * Math.PI * R;
  const progress = total ? Math.max(0, clock.remaining / total) : 0;
  const stroke = hot ? '#0B1110' : clock.urgent ? '#E7AE86' : '#C8A052';

  return (
    <div className="relative mx-auto mt-8 grid h-48 w-48 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 176 176" aria-hidden="true">
        <circle cx="88" cy="88" r={R} fill="none" stroke={hot ? 'rgba(11,17,16,0.22)' : '#323D3A'} strokeWidth="6" />
        <motion.circle
          cx="88"
          cy="88"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 600ms linear, stroke 600ms ease' }}
        />
      </svg>

      <div className="text-center">
        <span className={`block text-micro ${hot ? 'text-white/80' : 'text-cocoa'}`}>{COPY.remaining}</span>
        <Num className={`mt-1 block text-clock font-semibold leading-none ${hot ? 'text-white' : 'text-espresso'}`}>
          {clock.label}
        </Num>
        {/* Screen readers should not announce every tick; this is the polite
            version, in words rather than digits so it reads cleanly in Hebrew. */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          נותרו {clock.minutes} דקות ו־{clock.seconds} שניות לאישור
        </p>
      </div>
    </div>
  );
}

function Confirmed({ offer }) {
  const tz = offer.barber?.timezone && offer.barber.timezone !== 'Europe/Paris' ? offer.barber.timezone : SHOP_TZ;
  const rows = [
    [COPY.confirmed.service, offer.service.name],
    [COPY.confirmed.payment, COPY.cash],
    offer.barber.addressLine ? [COPY.confirmed.where, offer.barber.addressLine] : null,
  ].filter(Boolean);

  return (
    <motion.div
      className="w-full max-w-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className="rounded-glass bg-white p-10 text-center shadow-lift">
        <motion.span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill bg-mint"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
        >
          <motion.svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <motion.path
              d="M5 12.5 10 17.5 19 7"
              stroke="#0B1110"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            />
          </motion.svg>
        </motion.span>

        <h1 className="mt-6 font-display text-d3 font-semibold text-espresso">{COPY.confirmed.title}</h1>
        <p className="mt-2 text-lead text-cocoa">
          <SlotTime iso={offer.slotStartAt} tz={tz} />
        </p>

        <div className="mx-auto mt-8 max-w-xs space-y-3 border-t border-sand pt-6 text-start">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-6">
              <span className="text-note text-cocoa">{label}</span>
              <span className="text-end text-note font-semibold text-espresso">{value}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-6 pt-1">
            <span className="text-note text-cocoa">סה״כ</span>
            <Price cents={offer.service.priceCents} className="text-price font-semibold text-mint-deep" />
          </div>
        </div>

        <p className="mt-8 text-note text-cocoa">{COPY.confirmed.sms}</p>
      </div>
    </motion.div>
  );
}

function Message({ title, body }) {
  return (
    <motion.div
      className="w-full max-w-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="rounded-glass bg-white p-10 text-center shadow-lift">
        <h1 className="font-display text-d3 font-semibold text-espresso">{title}</h1>
        <p className="he-body mt-4 text-base text-cocoa">{body}</p>
        <a
          href="/"
          className="mt-8 inline-block rounded-pill border-2 border-sand px-7 py-3 text-note font-semibold text-espresso transition-colors duration-300 hover:border-espresso"
        >
          {COPY.home}
        </a>
      </div>
    </motion.div>
  );
}

const Pulse = () => (
  <div className="flex gap-1.5" role="status" aria-label="טוען">
    {['bg-pomegranate', 'bg-citrus', 'bg-azure'].map((c, i) => (
      <motion.span
        key={c}
        className={`h-2 w-2 rounded-full ${c}`}
        animate={{ opacity: [0.25, 1, 0.25] }}
        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
      />
    ))}
  </div>
);
