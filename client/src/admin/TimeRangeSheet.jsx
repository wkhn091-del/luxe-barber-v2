import { useEffect, useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import { admin } from '../lib/adminApi.js';
import { Num, formatClock } from '../lib/bidi.jsx';
import { durationLabel } from '../lib/schedule.js';

/**
 * ===========================================================================
 *  לפתוח או לחסום טווח מדויק
 * ===========================================================================
 *
 * The gap sheet handles the common case — take the whole opening. This handles
 * the one that actually comes up: a three-hour hole in the afternoon, and the
 * barber wants thirty minutes of it for lunch, starting at one.
 *
 * TWO STEPPED VALUES RATHER THAN A TIME PICKER. A native `<input type="time">`
 * opens a scroll wheel that needs both hands and lands on 13:07; stepping by
 * the shop's own slot granularity can only ever produce a time the booking
 * engine can use. Constraining the input is cheaper than validating the output.
 *
 * The same sheet does both jobs because the shapes are identical — a start, a
 * length, and a verb. Only the verb and the consequence line change.
 *
 * RTL NOTE: the − and + are NOT swapped. Minus sits at the start of the row
 * (the right) and plus at the end, which mirrors with the layout, but their
 * MEANING is arithmetic rather than directional — "+" always adds. Flipping
 * them because the page is RTL is the kind of over-correction that makes a
 * barber shorten a slot when they meant to lengthen it.
 */
export default function TimeRangeSheet({
  open,
  mode, // 'block' | 'open'
  bounds, // { start, end } — the gap being carved up; optional for 'open'
  timeZone,
  granularityMin = 15,
  onClose,
  onChanged,
}) {
  const [startOffset, setStartOffset] = useState(0); // minutes from bounds.start
  const [length, setLength] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [result, setResult] = useState(null);

  const anchor = bounds?.start ?? roundUp(new Date(), granularityMin);
  const ceiling = bounds ? Math.round((bounds.end - bounds.start) / 60_000) : 12 * 60;

  useEffect(() => {
    if (!open) return;
    setStartOffset(0);
    setLength(Math.min(60, ceiling));
    setError(null);
    setConflicts(null);
    setResult(null);
  }, [open, ceiling]);

  const start = new Date(anchor.getTime() + startOffset * 60_000);
  // Clamp so the range can never run past the opening it is carved from.
  const maxLength = Math.max(granularityMin, ceiling - startOffset);
  const effectiveLength = Math.min(length, maxLength);
  const end = new Date(start.getTime() + effectiveLength * 60_000);

  async function apply(force = false) {
    setBusy(true);
    setError(null);
    setConflicts(null);
    try {
      const payload = [start.toISOString(), end.toISOString()];
      const res =
        mode === 'open'
          ? await admin.openHours(...payload)
          : await admin.blockHours(...payload, undefined, force);
      setResult(res);
    } catch (err) {
      // The server refuses to block over live bookings and hands back who is in
      // the way, so the sheet can show them instead of just saying no.
      if (err.code === 'HAS_APPOINTMENTS') setConflicts(err.details ?? []);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const RangeLabel = () => (
    <>
      <Num>{formatClock(start, timeZone)}</Num>
      <span className="mx-1.5 text-haze" aria-hidden="true">–</span>
      <Num>{formatClock(end, timeZone)}</Num>
    </>
  );

  if (result) {
    const offers = result.offersSent ?? 0;
    return (
      <Sheet open onClose={onChanged} title={null}>
        <div className="pb-6 pt-2 text-center">
          <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-pill ${mode === 'open' ? 'bg-mint' : 'bg-cocoa'}`}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5 10 17.5 19 7" stroke="#0B1110" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          <h2 className="mt-6 font-display text-d3 font-semibold text-espresso">
            {mode === 'open'
              ? offers > 0
                ? <>נשלחו <Num>{offers}</Num> הצעות</>
                : 'השעות נפתחו'
              : 'הזמן נחסם'}
          </h2>

          <p className="he-body mt-4 text-note text-cocoa">
            <RangeLabel />
            {mode === 'open'
              ? offers > 0
                ? ' — הרשימה קיבלה הודעה, אדם אחד לכל משבצת, 15 דקות לכל אחד.'
                : ' פתוח באתר. אף אחד ברשימה לא התאים, אז פשוט אפשר לקבוע.'
              : ' — אף אחד לא יכול לקבוע בזמן הזה.'}
          </p>

          <button
            type="button"
            onClick={onChanged}
            className="mt-8 w-full rounded-pill border-2 border-sand bg-white py-3.5 text-base font-semibold text-espresso"
          >
            חזרה ליומן
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'open' ? 'לפתוח שעות' : 'לחסום זמן'}>
      <div className="space-y-7 pb-4">
        {/* The range, stated once, big. Everything below adjusts this line. */}
        <div className={`rounded-plate ${mode === 'open' ? 'bg-mint-soft' : 'bg-shell'} px-4 py-5 text-center`}>
          <p className="font-display text-d3 font-semibold text-espresso">
            <RangeLabel />
          </p>
          <p className="mt-1.5 text-note text-cocoa">{durationLabel(effectiveLength)}</p>
        </div>

        {bounds && (
          <Stepped
            label="מתחיל בשעה"
            value={<Num>{formatClock(start, timeZone)}</Num>}
            onDown={() => setStartOffset((o) => Math.max(0, o - granularityMin))}
            onUp={() => setStartOffset((o) => Math.min(ceiling - granularityMin, o + granularityMin))}
            downLabel="להתחיל מוקדם יותר"
            upLabel="להתחיל מאוחר יותר"
          />
        )}

        <Stepped
          label="למשך"
          value={durationLabel(effectiveLength)}
          onDown={() => setLength((l) => Math.max(granularityMin, l - granularityMin))}
          onUp={() => setLength((l) => Math.min(maxLength, l + granularityMin))}
          downLabel="לקצר"
          upLabel="להאריך"
        />

        <div className="flex flex-wrap gap-2">
          {[30, 60, 90, 120]
            .filter((m) => m <= maxLength)
            .map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLength(m)}
                aria-pressed={effectiveLength === m}
                className={[
                  'rounded-pill border-2 px-4 py-2 text-note font-semibold transition-all duration-300 ease-lux active:scale-[0.97]',
                  effectiveLength === m
                    ? 'border-espresso bg-espresso text-cream'
                    : 'border-sand bg-white text-cocoa hover:border-cocoa/40',
                ].join(' ')}
              >
                {durationLabel(m)}
              </button>
            ))}
        </div>

        <p className="he-body text-note text-cocoa">
          {mode === 'open'
            ? 'כל מי שמתאים ברשימת ההמתנה יקבל הודעה מיד.'
            : 'יורד מהאתר מיד. תורים שכבר נקבעו נשארים במקום.'}
        </p>

        {conflicts && (
          <div className="rounded-plate border-2 border-citrus bg-citrus-soft px-4 py-4">
            <p className="text-note font-semibold text-espresso">
              יש <Num>{conflicts.length}</Num> תורים בתוך הזמן הזה.
            </p>
            <ul className="mt-3 space-y-1">
              {conflicts.map((c) => (
                <li key={c.id} className="text-note text-cocoa">
                  <Num>{formatClock(c.startAt, timeZone)}</Num> · {c.client?.name}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={busy}
              className="mt-4 w-full rounded-pill border-2 border-citrus-deep bg-white py-3 text-note font-semibold text-citrus-deep"
            >
              לחסום בכל זאת ולהשאיר את התורים
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => apply(false)}
          disabled={busy}
          className={[
            'w-full rounded-pill py-4 text-base font-semibold text-white shadow-pop',
            'transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-40',
            mode === 'open' ? 'bg-mint hover:bg-mint-deep' : 'bg-espresso',
          ].join(' ')}
        >
          {busy ? 'רגע…' : mode === 'open' ? <>לפתוח <RangeLabel /></> : <>לחסום <RangeLabel /></>}
        </button>
      </div>
    </Sheet>
  );
}

/** Round an instant up to the next slot boundary. */
function roundUp(date, granularityMin) {
  const d = new Date(date);
  d.setMinutes(Math.ceil(d.getMinutes() / granularityMin) * granularityMin, 0, 0);
  return d;
}

/**
 * Value with a minus and a plus. 48px targets, value between them so the
 * barber's eye does not travel while their thumb does.
 */
const Stepped = ({ label, value, onDown, onUp, downLabel, upLabel }) => (
  <div>
    <span className="text-note font-semibold text-espresso">{label}</span>
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onDown}
        aria-label={downLabel}
        className="h-12 w-12 shrink-0 rounded-plate border-2 border-sand bg-white text-lg font-semibold text-cocoa transition-colors duration-300 ease-lux hover:border-cocoa/40"
      >
        −
      </button>
      <span className="flex-1 text-center text-base font-semibold text-espresso">{value}</span>
      <button
        type="button"
        onClick={onUp}
        aria-label={upLabel}
        className="h-12 w-12 shrink-0 rounded-plate border-2 border-sand bg-white text-lg font-semibold text-cocoa transition-colors duration-300 ease-lux hover:border-cocoa/40"
      >
        +
      </button>
    </div>
  </div>
);
