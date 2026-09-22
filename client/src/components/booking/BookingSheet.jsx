import { useCallback, useEffect, useMemo, useState } from 'react';
import Sheet from '../Sheet.jsx';
import DayStrip from './DayStrip.jsx';
import TimeGrid from './TimeGrid.jsx';
import DetailsForm from './DetailsForm.jsx';
import WaitlistForm from './WaitlistForm.jsx';
import { api } from '../../lib/api.js';
import { Num, Price, SlotTime, SHOP_TZ, themeFor } from '../../lib/bidi.jsx';
import { forget, loadRemembered, remember } from '../../lib/rememberMe.js';

/**
 * ===========================================================================
 *  קביעת תור
 * ===========================================================================
 *
 * Four states in one sheet: מתי → מי → נקבע, with a waitlist branch hanging off
 * "מתי". The service is chosen before the sheet opens (a tap on a menu card),
 * so the flow never starts on a menu the person has already read.
 *
 * The branch is the interesting part. Running out of times is the EXPECTED case
 * for a shop with one chair, so it is not an error state — it is a second door,
 * entered by tapping the full day itself, carrying forward the day and
 * time-of-day the person was already reaching for.
 *
 * ---------------------------------------------------------------------------
 * Money and time
 * ---------------------------------------------------------------------------
 * Every price renders through `<Price>`, which formats `he-IL` + ILS and
 * ignores whatever currency the API reports. Every date and time renders
 * through `<SlotTime>` / `formatClock`, in the SHOP's timezone with
 * `Asia/Jerusalem` as the fallback — so a stale `Europe/Paris` row cannot put
 * someone in the chair an hour late.
 *
 * The sheet also carries the service's colour all the way through, so the flow
 * that opened from the blue card stays blue to the confirmation. That is what
 * makes the sheet feel like it belongs to the card you tapped.
 */

const COPY = {
  steps: { when: 'בחרו מועד', who: 'הפרטים שלכם', waitlist: 'רשימת המתנה' },
  pick: 'בחרו יום ושעה',
  fullDay: 'היום הזה תפוס',
  fullDayBody: 'אפשר לבחור יום אחר למעלה, או להיכנס לרשימה ונעדכן ברגע שמתפנה מקום.',
  joinQueue: 'להצטרף לרשימה',
  changeTime: 'לבחור מועד אחר',
  backToTimes: 'חזרה לשעות הפנויות',
  taken: 'מישהו הקדים אתכם לשעה הזו. אלה השעות שעדיין פנויות.',
  alreadyQueued: 'אתם כבר ברשימה לטיפול הזה — נעדכן ברגע שמתפנה מקום.',
  confirmed: {
    title: 'התור נקבע',
    payment: 'תשלום',
    where: 'כתובת',
    service: 'טיפול',
    sms: 'שלחנו לכם אישור בהודעה. נזכיר יום לפני.',
    done: 'סגור',
  },
  queued: {
    title: (n) => `אתם מספר ${n} ברשימה`,
    lines: [
      'אנחנו פונים לרשימה אחד־אחד, לפי הסדר.',
      'כשיגיע תורכם, התור יישמר לכם ל־15 דקות.',
    ],
    note: 'אין מה לעשות עכשיו — רק להשאיר את הטלפון בהישג יד.',
    done: 'סגור',
  },
  cash: 'מזומן במקום',
};

/**
 * The client block for POST /appointments and /waitlist. Email travels only when
 * typed: the API validates it as an address, and an empty string is not one.
 */
const clientPayload = ({ name, phone, email = '', marketingOptIn = false }) => ({
  name: name.trim(),
  phone: phone.trim(),
  locale: 'he',
  ...(email.trim() ? { email: email.trim() } : {}),
  ...(marketingOptIn ? { marketingOptIn: true } : {}),
});

const EMPTY_DETAILS = { name: '', phone: '', email: '', marketingOptIn: false };

export default function BookingSheet({ open, service, shop, onClose }) {
  const [step, setStep] = useState('when'); // when | who | waitlist | booked | queued
  const [days, setDays] = useState([]);
  const [closedDates, setClosedDates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [prefillPref, setPrefillPref] = useState('ANY');

  // Remember me: a returning client finds their details already filled in.
  const [details, setDetails] = useState(() => ({ ...EMPTY_DETAILS, ...(loadRemembered() ?? {}) }));
  const [rememberMe, setRememberMe] = useState(true);
  const [remembered, setRemembered] = useState(() => Boolean(loadRemembered()));
  const memory = {
    on: rememberMe,
    set: setRememberMe,
    saved: remembered,
    forget: () => {
      forget();
      setRemembered(false);
      setDetails(EMPTY_DETAILS);
    },
  };
  // Saved only after a booking or waitlist join succeeds — and only if ticked.
  const keepDetails = () => {
    if (rememberMe) remember(details);
    else forget();
  };
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Asia/Jerusalem is the fallback, so a legacy Europe/Paris row in the
  // database cannot silently shift every displayed time by an hour.
  const timeZone = shop?.timezone && shop.timezone !== 'Europe/Paris' ? shop.timezone : SHOP_TZ;

  // The colour follows the card that was tapped, all the way to the receipt.
  const theme = useMemo(() => themeFor(service?.sortOrder ? service.sortOrder - 1 : 0), [service]);

  // --- Load availability --------------------------------------------------

  useEffect(() => {
    if (!open || !service) return undefined;
    let cancelled = false;

    setLoading(true);
    setStep('when');
    setError(null);
    setSelectedTime(null);
    setResult(null);

    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 3600_000);

    api
      .availability(service.id, from, to)
      .then((data) => {
        if (cancelled) return;
        setDays(data.days);
        // `closedDates` is a small addition to GET /api/availability — without
        // it a shut Saturday and a fully booked Thursday are indistinguishable,
        // and offering to queue for a day the shop never opens is a dead end.
        setClosedDates(data.closedDates ?? []);
        setSelectedDate(data.days.find((d) => d.times.length)?.date ?? null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, service]);

  // Fill the strip with 14 real dates so full and closed days still appear —
  // the API only returns days that have something in them.
  // The 14 dates are the SHOP's calendar days, counted from its own "today".
  // (They used to be UTC dates: between midnight and 3am in Israel the strip
  // started on yesterday and showed it as full.) Stepping the calendar date,
  // not adding 24h, also keeps DST days from being skipped or doubled.
  const strip = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone }).format(new Date()).split('-').map(Number);
    return Array.from({ length: 14 }, (_, i) => {
      const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
      return byDate.get(date) ?? { date, times: [] };
    });
  }, [days, timeZone]);

  const times = strip.find((d) => d.date === selectedDate)?.times ?? [];

  const toWaitlist = useCallback((pref = 'ANY') => {
    setPrefillPref(pref);
    setError(null);
    setStep('waitlist');
  }, []);

  // --- Submit -------------------------------------------------------------

  async function book() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.book({
        serviceId: service.id,
        startAt: selectedTime,
        client: clientPayload(details),
      });
      keepDetails();
      setResult(res.appointment);
      setStep('booked');
    } catch (err) {
      // SLOT_TAKEN is the one failure worth handling specially: someone
      // committed to that slot while this person was typing their name. Send
      // them back to a refreshed grid rather than leaving a dead button.
      if (err.code === 'SLOT_TAKEN') {
        setSelectedTime(null);
        setStep('when');
        setError(COPY.taken);
        api
          .availability(service.id, new Date(), new Date(Date.now() + 14 * 24 * 3600_000))
          .then((data) => setDays(data.days))
          .catch(() => {});
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function joinQueue(preferences) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.joinWaitlist({
        serviceId: service.id,
        client: clientPayload(details),
        ...preferences,
      });
      keepDetails();
      setResult(res.waitlist);
      setStep('queued');
    } catch (err) {
      setError(err.code === 'ALREADY_QUEUED' ? COPY.alreadyQueued : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // --- Render -------------------------------------------------------------

  const titles = { when: service?.name, who: COPY.steps.who, waitlist: COPY.steps.waitlist, booked: null, queued: null };

  return (
    <Sheet open={open} onClose={onClose} title={titles[step]}>
      {step === 'when' && (
        <div className="space-y-6 pb-4">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-pill bg-shell px-3.5 py-1.5 text-micro font-semibold text-cocoa">
              <Num>{service?.durationMin}</Num> דקות
            </span>
            <Price cents={service?.priceCents ?? 0} className={`text-price font-semibold ${theme.text}`} />
          </div>

          {error && (
            <p role="alert" className="rounded-plate bg-citrus-soft px-4 py-3 text-note text-citrus-deep">
              {error}
            </p>
          )}

          {loading ? (
            <div className="h-28 animate-breathe rounded-plate bg-shell" role="status" aria-label="טוען שעות" />
          ) : (
            <>
              <div>
                <h3 className="mb-3 text-note font-semibold text-espresso">{COPY.pick}</h3>
                <DayStrip
                  days={strip}
                  closedDates={closedDates}
                  timeZone={timeZone}
                  value={selectedDate}
                  theme={theme}
                  onChange={(date, { full }) => {
                    setSelectedDate(date);
                    setSelectedTime(null);
                    // Tapping a full day IS the waitlist entry point.
                    if (full) toWaitlist('ANY');
                  }}
                />
              </div>

              {times.length > 0 ? (
                <TimeGrid
                  times={times}
                  timeZone={timeZone}
                  value={selectedTime}
                  theme={theme}
                  onChange={setSelectedTime}
                  onWaitlist={toWaitlist}
                />
              ) : (
                <div className="rounded-plate border-2 border-dashed border-sand px-5 py-8 text-center">
                  <p className="font-display text-d3 font-semibold text-espresso">{COPY.fullDay}</p>
                  <p className="he-body mt-3 text-note text-cocoa">{COPY.fullDayBody}</p>
                  <button
                    type="button"
                    onClick={() => toWaitlist('ANY')}
                    className={`mt-6 rounded-pill ${theme.btn} px-7 py-3 text-note font-semibold text-white`}
                  >
                    {COPY.joinQueue}
                  </button>
                </div>
              )}

              {selectedTime && (
                <button
                  type="button"
                  onClick={() => setStep('who')}
                  className={`w-full rounded-pill ${theme.btn} py-4 text-base font-semibold text-white shadow-pop transition-transform duration-300 ease-lux active:scale-[0.98]`}
                >
                  <SlotTime iso={selectedTime} tz={timeZone} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {step === 'who' && (
        <div className="pb-4">
          <DetailsForm
            value={details}
            memory={memory}
            onChange={setDetails}
            onSubmit={book}
            submitting={submitting}
            error={error}
            theme={theme}
            summary={
              <div className={`rounded-plate ${theme.soft} px-4 py-4`}>
                <p className="text-base font-semibold text-espresso">
                  <SlotTime iso={selectedTime} tz={timeZone} />
                </p>
                <p className="mt-1 flex items-center gap-2 text-note text-cocoa">
                  <span>{service?.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <Num>{service?.durationMin}</Num> דק׳
                  </span>
                  <span aria-hidden="true">·</span>
                  <Price cents={service?.priceCents ?? 0} />
                </p>
              </div>
            }
          />
          <button
            type="button"
            onClick={() => setStep('when')}
            className="mt-4 w-full py-2 text-note text-cocoa transition-colors duration-300 hover:text-espresso"
          >
            {COPY.changeTime}
          </button>
        </div>
      )}

      {step === 'waitlist' && (
        <div className="pb-4">
          <WaitlistForm
            service={service}
            offerWindowMin={shop?.offerTtlMin ?? 15}
            initialWeekday={
              selectedDate ? new Date(`${selectedDate}T12:00:00Z`).getUTCDay() || 7 : undefined
            }
            initialPref={prefillPref}
            details={details}
            memory={memory}
            onDetailsChange={setDetails}
            onSubmit={joinQueue}
            submitting={submitting}
            error={error}
            theme={theme}
          />
          <button
            type="button"
            onClick={() => setStep('when')}
            className="mt-4 w-full py-2 text-note text-cocoa transition-colors duration-300 hover:text-espresso"
          >
            {COPY.backToTimes}
          </button>
        </div>
      )}

      {step === 'booked' && (
        <Done
          theme={theme}
          title={COPY.confirmed.title}
          headline={<SlotTime iso={result.startAt} tz={timeZone} />}
          rows={[
            [COPY.confirmed.service, service?.name],
            [COPY.confirmed.payment, COPY.cash],
            shop?.addressLine ? [COPY.confirmed.where, shop.addressLine] : null,
            [null, <Price key="p" cents={service?.priceCents ?? 0} className="text-price font-semibold" />],
          ]}
          note={COPY.confirmed.sms}
          cta={COPY.confirmed.done}
          onClose={onClose}
        />
      )}

      {step === 'queued' && (
        <Done
          theme={theme}
          title={COPY.queued.title(result.position)}
          lines={COPY.queued.lines}
          note={COPY.queued.note}
          cta={COPY.queued.done}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

/**
 * The receipt.
 *
 * A coloured disc with a drawn check, the headline fact, then the details as a
 * label/value list. The check draws itself rather than fading in — it is the
 * one moment of reward in the whole flow and it should feel earned.
 */
function Done({ theme, title, headline, rows = [], lines = [], note, cta, onClose }) {
  return (
    <div className="pb-6 pt-2 text-center">
      <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-pill ${theme.btn}`}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5 10 17.5 19 7"
            stroke="#0B1110"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <h2 className="mt-6 font-display text-d3 font-semibold text-espresso">{title}</h2>
      {headline && <p className="mt-2 text-lead text-cocoa">{headline}</p>}

      {lines.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {lines.map((line) => (
            <p key={line} className="he-body text-note text-cocoa">
              {line}
            </p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mx-auto mt-8 max-w-xs space-y-3 border-t border-sand pt-6 text-start">
          {rows.filter(Boolean).map(([label, value], i) => (
            <div key={label ?? `row-${i}`} className="flex items-baseline justify-between gap-6">
              <span className="text-note text-cocoa">{label}</span>
              <span className="text-end text-note font-semibold text-espresso">{value}</span>
            </div>
          ))}
        </div>
      )}

      <p className="he-body mt-8 text-note text-cocoa">{note}</p>

      <button
        type="button"
        onClick={onClose}
        className="mt-7 w-full rounded-pill border-2 border-sand bg-white py-3.5 text-base font-semibold text-espresso transition-colors duration-300 hover:border-espresso"
      >
        {cta}
      </button>
    </div>
  );
}
