import { WEEK, hhmm, weekProblems } from '../lib/weeklyHours.js';
import Switch from './Switch.jsx';

/**
 * ===========================================================================
 *  The weekly schedule — the shifts the booking calendar is built from
 * ===========================================================================
 *
 * Controlled: the page that holds it owns `week` and saves it. Every bookable
 * slot on the site is generated from these shifts (availability.service.js),
 * and a slot is offered only if the whole appointment — length plus clean-up
 * buffer — fits inside one. The site's displayed hours are generated from the
 * same shifts, so the two never disagree.
 */
const STEP = 15;
const TIMES = Array.from({ length: (24 * 60) / STEP + 1 }, (_, i) => i * STEP); // 00:00 … 24:00
const MAX_SHIFTS = 3;

export default function WeekEditor({ week, onChange }) {
  const problems = weekProblems(week);
  const firstOpen = WEEK.find((d) => week[d.iso].length)?.iso;

  const change = (iso, shifts) => onChange({ ...week, [iso]: shifts });
  const setShift = (iso, index, patch) => change(iso, week[iso].map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const toggleDay = (iso) =>
    change(iso, week[iso].length ? [] : (firstOpen ? week[firstOpen] : [{ start: 9 * 60, end: 19 * 60 }]).map((s) => ({ ...s })));
  const addShift = (iso) => {
    const last = week[iso][week[iso].length - 1];
    const start = Math.min(last.end + 60, 24 * 60 - STEP);
    change(iso, [...week[iso], { start, end: Math.min(start + 3 * 60, 24 * 60) }]);
  };
  const copyToOpenDays = (iso) =>
    onChange(Object.fromEntries(WEEK.map((d) => [d.iso, d.iso !== iso && week[d.iso].length ? week[iso].map((s) => ({ ...s })) : week[d.iso]])));

  return (
    <div className="space-y-3">
      {WEEK.map((d) => {
        const shifts = week[d.iso];
        const open = shifts.length > 0;
        return (
          <section key={d.iso} className="rounded-plate border-2 border-sand bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-espresso">{d.name}</span>
              <Switch on={open} onToggle={() => toggleDay(d.iso)} label={`${d.name}: ${open ? 'פתוח' : 'סגור'}`} />
            </div>

            {open ? (
              <div className="mt-3 space-y-2">
                {shifts.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TimeSelect
                      label={`${d.name}, משמרת ${i + 1}: התחלה`}
                      value={s.start}
                      options={TIMES.filter((m) => m < 24 * 60)}
                      onChange={(start) => setShift(d.iso, i, { start })}
                    />
                    <span className="shrink-0 text-note text-haze">עד</span>
                    <TimeSelect
                      label={`${d.name}, משמרת ${i + 1}: סיום`}
                      value={s.end}
                      options={TIMES.filter((m) => m > 0)}
                      onChange={(end) => setShift(d.iso, i, { end })}
                    />
                    {shifts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => change(d.iso, shifts.filter((_, j) => j !== i))}
                        aria-label={`הסרת משמרת ${i + 1} ב${d.name}`}
                        className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-pill text-haze hover:text-citrus-deep"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                {problems[d.iso] && <p className="text-micro text-pomegranate-deep">{problems[d.iso]}</p>}
                <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
                  {shifts.length < MAX_SHIFTS && (
                    <button type="button" onClick={() => addShift(d.iso)} className="text-micro font-semibold text-pomegranate-deep">
                      + משמרת נוספת
                    </button>
                  )}
                  <button type="button" onClick={() => copyToOpenDays(d.iso)} className="text-micro font-semibold text-cocoa">
                    העתקה לשאר הימים הפתוחים
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-note text-haze">סגור — אין תורים ביום הזה</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TimeSelect({ label, value, options, onChange }) {
  const list = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <span className="relative min-w-0 flex-1">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full touch-manipulation appearance-none rounded-plate border-2 border-sand bg-white py-2.5 pe-9 ps-3 text-base font-semibold text-espresso focus:border-espresso"
      >
        {list.map((m) => (
          <option key={m} value={m}>
            {hhmm(m)}
          </option>
        ))}
      </select>
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-cocoa">
        <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
