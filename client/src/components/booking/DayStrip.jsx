import { Num } from '../../lib/bidi.jsx';

/**
 * ===========================================================================
 *  בחירת יום
 * ===========================================================================
 *
 * The important decision: a fully booked day is NOT hidden. It is shown,
 * labelled "מלא", and tapping it is how you join the waitlist. Hiding full days
 * makes a one-chair shop look empty and quietly loses the person who wanted
 * exactly that Thursday.
 *
 * Three states, three treatments:
 *   פנוי   — a count of free times, in the accent colour
 *   מלא    — dimmed, still a target, routes to the queue
 *   סגור   — the shop is shut; not a target, nothing to queue for
 */
export default function DayStrip({ days, closedDates = [], timeZone, value, onChange, theme }) {
  const fmt = (iso, opts) =>
    new Intl.DateTimeFormat('he-IL', { ...opts, timeZone }).format(new Date(`${iso}T12:00:00Z`));

  return (
    <div
      className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-2"
      role="radiogroup"
      aria-label="בחרו יום"
    >
      {days.map((day) => {
        const closed = closedDates.includes(day.date);
        const full = !closed && day.times.length === 0;
        const selected = value === day.date;

        return (
          <button
            key={day.date}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={closed}
            onClick={() => onChange(day.date, { full })}
            className={[
              'flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-plate border-2 py-3',
              'transition-[border-color,background-color,transform] duration-300 ease-lux',
              selected
                ? `${theme.border} ${theme.soft}`
                : 'border-sand bg-white hover:border-cocoa/40',
              closed ? 'cursor-default opacity-40 hover:border-sand' : 'active:scale-[0.97]',
            ].join(' ')}
          >
            {/* יום א׳ … יום ש׳ */}
            <span className="text-micro text-cocoa">{fmt(day.date, { weekday: 'short' })}</span>
            <span className="font-display text-xl font-semibold leading-none text-espresso">
              <Num>{fmt(day.date, { day: 'numeric' })}</Num>
            </span>
            <span
              className={[
                'text-micro font-semibold',
                closed ? 'text-haze' : full ? 'text-citrus-deep' : theme.text,
              ].join(' ')}
            >
              {closed ? 'סגור' : full ? 'מלא' : <Num>{day.times.length}</Num>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
