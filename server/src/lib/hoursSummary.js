/**
 * The weekly schedule as the one-line-per-run text the site shows under
 * "איפה אנחנו" — generated from WorkingHoursRule on every request, so the
 * displayed hours and the bookable hours can never disagree.
 *
 * Mirrors client/src/lib/weeklyHours.js (summarizeWeek), which renders the
 * same text as a live preview in the admin. Keep the two in step.
 */
const WEEK = [
  { iso: 7, name: 'ראשון' },
  { iso: 1, name: 'שני' },
  { iso: 2, name: 'שלישי' },
  { iso: 3, name: 'רביעי' },
  { iso: 4, name: 'חמישי' },
  { iso: 5, name: 'שישי' },
  { iso: 6, name: 'שבת' },
];
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function summarizeRules(rules) {
  const hoursOf = (iso) =>
    rules
      .filter((r) => r.weekday === iso && r.active !== false)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((r) => `${hhmm(r.startMinute)}–${hhmm(r.endMinute)}`)
      .join(', ');
  const lines = [];
  for (let i = 0; i < WEEK.length; ) {
    const hours = hoursOf(WEEK[i].iso);
    let j = i;
    while (j + 1 < WEEK.length && hoursOf(WEEK[j + 1].iso) === hours) j += 1;
    const days = i === j ? WEEK[i].name : `${WEEK[i].name} – ${WEEK[j].name}`;
    lines.push(hours ? `${days}, ${hours}` : `${days} סגור`);
    i = j + 1;
  }
  return lines.join('\n');
}
