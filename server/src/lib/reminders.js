/**
 * ===========================================================================
 *  REMINDERS — the one place that decides when they go out
 * ===========================================================================
 *
 * Two reminders per appointment: a day before, and ONE HOUR before. The
 * sweeper (jobs/sweeper.js) sends each one once, when the appointment enters
 * its window; `column` is the marker that records it was handled.
 *
 * THE RULE: a reminder exists only if the appointment was confirmed STRICTLY
 * more than its lead time before it starts. Book 20 minutes ahead and there is
 * nothing to remind anyone of — the confirmation just said it all. So whatever
 * confirms an appointment spreads remindersAlreadyCovered() into the same
 * write, and the sweeper never sends what the confirmation already covered.
 *
 * (Before this, the sweeper sent every unsent reminder whose window the
 * appointment was inside — so a booking made inside a window received that
 * "reminder" on the next 30-second tick, right behind its own confirmation.)
 */

/** Nearest first. The order matters to reminderWindows(). */
export const REMINDERS = [
  // The column name predates the move from two hours to one; it is simply the
  // short reminder's marker.
  { template: 'REMINDER_1H', column: 'reminder2SentAt', minutesBefore: 60 },
  { template: 'REMINDER_24H', column: 'reminder24SentAt', minutesBefore: 24 * 60 },
];

/**
 * The markers to set when an appointment starting at `startAt` is confirmed
 * at `now`: every reminder whose lead time the appointment is already inside.
 *
 * @returns {Record<string, Date>} e.g. { reminder2SentAt: now, reminder24SentAt: now }
 */
export function remindersAlreadyCovered(startAt, now = new Date()) {
  const lead = new Date(startAt).getTime() - now.getTime();
  const covered = {};
  for (const { column, minutesBefore } of REMINDERS) {
    // `!(a > b)` rather than `a <= b`, so an unreadable date counts as covered.
    if (!(lead > minutesBefore * 60_000)) covered[column] = now;
  }
  return covered;
}

/**
 * Where the sweeper looks for each reminder: from the next-nearer reminder's
 * edge out to its own. The day-before reminder therefore never goes to an
 * appointment already inside the two-hour window — if the server slept
 * through a day-before moment, it wakes up and sends only the one that is
 * still true, instead of both at once.
 */
export function reminderWindows(now = new Date()) {
  return REMINDERS.map((reminder, i) => ({
    ...reminder,
    after: new Date(now.getTime() + (i ? REMINDERS[i - 1].minutesBefore : 0) * 60_000),
    until: new Date(now.getTime() + reminder.minutesBefore * 60_000),
  }));
}
