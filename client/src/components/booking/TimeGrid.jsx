import { Num, formatClock } from '../../lib/bidi.jsx';

/**
 * ===========================================================================
 *  בחירת שעה
 * ===========================================================================
 *
 * Grouped morning / afternoon / evening — and the grouping is not decorative.
 * Those three buckets are exactly the `TimePreference` enum the waitlist
 * stores, so if someone scans the afternoon and finds nothing they like, the
 * "אין שעה שמתאימה" link hands the waitlist form `timePref: AFTERNOON`
 * pre-filled. The UI and the data model speak the same vocabulary, which is
 * what makes the handoff feel like a continuation rather than a new form.
 */
const BUCKETS = [
  { key: 'MORNING', label: 'בוקר', until: 12 },
  { key: 'AFTERNOON', label: 'צהריים', until: 17 },
  { key: 'EVENING', label: 'ערב', until: 24 },
];

export default function TimeGrid({ times, timeZone, value, onChange, onWaitlist, theme }) {
  // Bucket by the SHOP's local hour, not the device's — someone booking from
  // abroad must see the barber's afternoon, not their own.
  const hourIn = (iso) =>
    Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(new Date(iso))
    );

  const groups = BUCKETS.map((bucket, i) => ({
    ...bucket,
    times: times.filter((t) => {
      const h = hourIn(t);
      const from = i === 0 ? 0 : BUCKETS[i - 1].until;
      return h >= from && h < bucket.until;
    }),
  })).filter((g) => g.times.length);

  if (!times.length) return null;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-note font-semibold text-espresso">{group.label}</h3>
            <button
              type="button"
              onClick={() => onWaitlist(group.key)}
              className="text-micro text-cocoa underline-offset-4 transition-colors duration-300 hover:text-espresso hover:underline"
            >
              אין שעה שמתאימה
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {group.times.map((iso) => {
              const selected = value === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => onChange(iso)}
                  aria-pressed={selected}
                  className={[
                    // touch-manipulation: no double-tap-zoom wait, so a tap selects at once.
                    'touch-manipulation select-none rounded-plate border-2 py-3 text-base font-semibold',
                    'transition-[border-color,background-color,color,transform] duration-300 ease-lux active:scale-[0.97]',
                    selected
                      ? `${theme.border} ${theme.btn} text-white`
                      : 'border-sand bg-white text-espresso hover:border-cocoa/40',
                  ].join(' ')}
                >
                  <Num>{formatClock(iso, timeZone)}</Num>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
