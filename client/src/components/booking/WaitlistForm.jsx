import { useState } from 'react';
import { Num, HE_WEEKDAYS } from '../../lib/bidi.jsx';
import { isEmail, optionalEmailOk } from '../../lib/email.js';
import ClientExtras from './ClientExtras.jsx';

/**
 * ===========================================================================
 *  רשימת המתנה
 * ===========================================================================
 *
 * Reached by tapping a full day, or by "אין שעה שמתאימה" under a time group.
 * Either way it arrives pre-filled from what the person just tried, so it reads
 * as a continuation of the booking rather than a consolation form.
 *
 * The three inputs map one-to-one onto the `WaitlistEntry` columns, and that is
 * deliberate — `pickCandidate()` on the server filters on exactly these, so
 * anything the UI cannot express is a slot the engine can never offer.
 *
 *   weekdayMask   a 7-bit integer, bit 0 = Monday (ISO-8601)
 *   timePref      ANY | MORNING | AFTERNOON | EVENING
 *   earliest/latestDate
 *
 * Note the weekday chips run SUNDAY-FIRST — the Israeli week — while the
 * bitmask stays ISO (Monday = bit 0), because that is what the database
 * expects. `HE_WEEKDAYS` carries both, so the conversion happens in one place
 * instead of being re-derived at every call site.
 */
const WINDOWS = [
  { days: 7, label: 'השבוע הקרוב' },
  { days: 14, label: 'השבועיים הקרובים' },
  { days: 30, label: 'החודש הקרוב' },
];

const PREFS = [
  { key: 'ANY', label: 'כל שעה' },
  { key: 'MORNING', label: 'בוקר' },
  { key: 'AFTERNOON', label: 'צהריים' },
  { key: 'EVENING', label: 'ערב' },
];

export default function WaitlistForm({
  memory,
  service,
  offerWindowMin = 15,
  initialWeekday,
  initialPref = 'ANY',
  details,
  onDetailsChange,
  onSubmit,
  submitting,
  error,
  theme,
}) {
  const [mask, setMask] = useState(initialWeekday ? 1 << (initialWeekday - 1) : 127);
  const [pref, setPref] = useState(initialPref);
  const [windowDays, setWindowDays] = useState(14);

  const toggleDay = (iso) => {
    const bit = 1 << (iso - 1);
    const next = mask ^ bit;
    // Never let the mask reach zero — an entry matching no weekday would sit in
    // the queue forever without being offered anything.
    setMask(next === 0 ? bit : next);
  };

  const submit = () =>
    onSubmit({
      weekdayMask: mask,
      timePref: pref,
      earliestDate: new Date(),
      latestDate: new Date(Date.now() + windowDays * 24 * 3600_000),
    });

  const valid =
    details.name.trim().length >= 2 &&
    details.phone.replace(/\D/g, '').length >= 9 &&
    isEmail(details.email) &&
    !submitting;

  const chip = (active) =>
    [
      'rounded-pill border-2 px-4 py-2 text-note font-semibold transition-all duration-300 ease-lux active:scale-[0.97]',
      active ? `${theme.border} ${theme.soft} ${theme.text}` : 'border-sand bg-white text-cocoa hover:border-cocoa/40',
    ].join(' ');

  return (
    <div className="space-y-7">
      <div className={`rounded-plate ${theme.soft} p-5`}>
        <p className="he-body text-base text-espresso">
          <span className="font-semibold">{service?.name}</span> תפוס בתאריכים שבחרתם. הצטרפו
          לרשימה ונעדכן ברגע שמתפנה מקום — התור יישמר לכם ל־
          <Num>{offerWindowMin}</Num> דקות.
        </p>
      </div>

      <div>
        <h3 className="text-note font-semibold text-espresso">אילו ימים מתאימים?</h3>
        <div className="mt-3 flex gap-1.5">
          {HE_WEEKDAYS.map((day) => {
            const on = (mask & (1 << (day.iso - 1))) !== 0;
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => toggleDay(day.iso)}
                aria-pressed={on}
                aria-label={`יום ${day.full}`}
                className={[
                  'h-11 flex-1 rounded-plate border-2 text-note font-semibold transition-all duration-300 ease-lux',
                  on ? `${theme.border} ${theme.soft} ${theme.text}` : 'border-sand bg-white text-haze',
                ].join(' ')}
              >
                {day.short}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-note font-semibold text-espresso">באיזו שעה ביום?</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREFS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPref(p.key)} className={chip(pref === p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-note font-semibold text-espresso">עד מתי לחפש?</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <button key={w.days} type="button" onClick={() => setWindowDays(w.days)} className={chip(windowDays === w.days)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t border-sand pt-6">
        <label className="block">
          <span className="text-note font-semibold text-espresso">שם</span>
          <input
            type="text"
            autoComplete="name"
            value={details.name}
            onChange={(e) => onDetailsChange({ ...details, name: e.target.value })}
            placeholder="מה השם שלכם?"
            className="mt-2 w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze focus:border-espresso"
          />
        </label>
        <label className="block">
          <span className="text-note font-semibold text-espresso">טלפון נייד</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            style={{ textAlign: 'right' }}
            value={details.phone}
            onChange={(e) => onDetailsChange({ ...details, phone: e.target.value })}
            placeholder="050-000-0000"
            className="mt-2 w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze focus:border-espresso"
          />
        </label>
        {/* Required: the offer email is how a free slot reaches them in seconds. */}
        <label className="block">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-note font-semibold text-espresso">מייל להצעות</span>
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            style={{ textAlign: 'right' }}
            value={details.email ?? ''}
            onChange={(e) => onDetailsChange({ ...details, email: e.target.value })}
            placeholder="name@example.com"
            aria-invalid={optionalEmailOk(details.email) ? undefined : 'true'}
            className={`mt-2 w-full rounded-plate border-2 bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze ${
              optionalEmailOk(details.email) ? 'border-sand focus:border-espresso' : 'border-pomegranate'
            }`}
          />
          <span className="mt-1.5 block text-micro text-cocoa">כשמתפנה תור, הקישור לאישור מגיע לכאן תוך שניות.</span>
        </label>
      </div>

      <ClientExtras value={details} onChange={onDetailsChange} memory={memory} />

      {error && (
        <p role="alert" className="rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!valid}
        className={`w-full rounded-pill ${theme.btn} py-4 text-base font-semibold text-white shadow-pop transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-40`}
      >
        {submitting ? 'מצטרפים…' : 'להצטרף לרשימה'}
      </button>

      <p className="text-center text-note text-cocoa">אפשר לצאת מהרשימה בכל רגע — השיבו למייל מאיתנו או התקשרו.</p>
    </div>
  );
}
