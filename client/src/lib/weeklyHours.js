/**
 * The weekly schedule as the admin edits it — and as the site should describe it.
 *
 * The database stores one row per shift (WorkingHoursRule: ISO weekday
 * 1 = Monday … 7 = Sunday, minutes from midnight). The booking engine builds
 * every bookable slot from these rows and nothing else. Here they become a
 * week the barber can read, Sunday first, the way the Israeli week runs.
 */
export const WEEK = [
  { iso: 7, name: 'ראשון' },
  { iso: 1, name: 'שני' },
  { iso: 2, name: 'שלישי' },
  { iso: 3, name: 'רביעי' },
  { iso: 4, name: 'חמישי' },
  { iso: 5, name: 'שישי' },
  { iso: 6, name: 'שבת' },
];

export const hhmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** DB rows → { [iso]: [{ start, end }] }, each day's shifts in order. */
export function weekFromRules(rules) {
  const week = Object.fromEntries(WEEK.map((d) => [d.iso, []]));
  for (const r of rules ?? []) {
    if (r.active === false || !week[r.weekday]) continue;
    week[r.weekday].push({ start: r.startMinute, end: r.endMinute });
  }
  for (const d of WEEK) week[d.iso].sort((a, b) => a.start - b.start);
  return week;
}

export const rulesFromWeek = (week) =>
  WEEK.flatMap((d) => week[d.iso].map((s) => ({ weekday: d.iso, startMinute: s.start, endMinute: s.end })));

/** The same checks the server makes (schedule.service.js), in Hebrew, per day. */
export function weekProblems(week) {
  const problems = {};
  for (const d of WEEK) {
    const shifts = [...week[d.iso]].sort((a, b) => a.start - b.start);
    if (shifts.some((s) => s.start >= s.end)) problems[d.iso] = 'שעת הסיום צריכה להיות אחרי שעת ההתחלה';
    else if (shifts.some((s, i) => i > 0 && s.start < shifts[i - 1].end)) problems[d.iso] = 'המשמרות חופפות';
  }
  return problems;
}

/**
 * The week as one line per run of identical days — the text the site shows:
 *
 *   ראשון – חמישי, 09:00–13:00, 14:00–19:00
 *   שישי, 09:00–14:00
 *   שבת סגור
 */
export function summarizeWeek(week) {
  const hoursOf = (iso) =>
    [...week[iso]]
      .sort((a, b) => a.start - b.start)
      .map((s) => `${hhmm(s.start)}–${hhmm(s.end)}`)
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
