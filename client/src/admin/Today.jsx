import { useCallback, useEffect, useMemo, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { Num, Price, formatClock } from '../lib/bidi.jsx';
import { buildTimeline, durationLabel, todayISO, localMidnight } from '../lib/schedule.js';
import { useTick, secondsUntil, clockLabel } from '../hooks/useTick.js';
import SlotSheet from './SlotSheet.jsx';
import DeleteButton from './DeleteButton.jsx';
import ExportButton from './ExportButton.jsx';
import TimeRangeSheet from './TimeRangeSheet.jsx';

/**
 * ===========================================================================
 *  היום — the screen the barber lives in
 * ===========================================================================
 *
 * Looked at one-handed, between cuts, for about two seconds. Everything below
 * follows from that.
 *
 * THE DESIGN DECISION WORTH DEFENDING: **gaps are rows.** Most admin calendars
 * render appointments and leave the empty time as background, which is exactly
 * backwards for this product — the whole thesis of the waitlist is that an
 * empty chair is the thing to act on. So a free hour gets its own row, its own
 * duration, and a one-tap "למלא". The barber never has to reason about where
 * the holes are; the holes announce themselves.
 *
 * ---------------------------------------------------------------------------
 * Colour carries status
 * ---------------------------------------------------------------------------
 *   mint        confirmed — money in the book
 *   citrus      a waitlist hold, ticking
 *   pomegranate that hold with under a minute left, or an open gap's CTA
 *   sand/haze   finished, or nothing happening
 *
 * The hold's countdown turns pomegranate at the same instant the client's own
 * offer screen does. Both sides of the product go red together.
 *
 * ---------------------------------------------------------------------------
 * Every numeral is isolated
 * ---------------------------------------------------------------------------
 * This screen is almost entirely numbers — times, durations, prices,
 * countdowns — sitting inside Hebrew. Un-isolated, "15:00" renders as "00:15"
 * and a price loses its shekel sign to the wrong end of the line. `<Num>` and
 * `<Price>` from lib/bidi.jsx wrap every one of them.
 */
export default function Today({ barber }) {
  const timeZone = barber?.timezone ?? 'Asia/Jerusalem';
  const dateISO = todayISO(timeZone);

  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null); // the row whose sheet is open
  const [blockRange, setBlockRange] = useState(null); // the gap being carved up

  // ONE interval for the whole screen. Every holding row computes its own
  // remaining seconds from its own deadline during the render this triggers,
  // rather than each owning a timer.
  useTick(1000);

  const load = useCallback(async () => {
    const from = localMidnight(dateISO, timeZone);
    const to = new Date(from.getTime() + 24 * 3600_000);

    const [hours, exs, appts] = await Promise.all([
      admin.workingHours(),
      admin.exceptions(from, to),
      admin.appointments(from, to),
    ]);

    setRules(hours.rules ?? []);
    setExceptions(exs.exceptions ?? []);
    setAppointments(appts.appointments ?? []);
    setLoading(false);
  }, [dateISO, timeZone]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  // Silent removal — for demo and test bookings. Cancelling (with a message
  // to the client and the waitlist refill) stays in the appointment's sheet.
  const remove = useCallback(
    async (id) => {
      await admin.deleteAppointment(id);
      await load();
    },
    [load]
  );

  const rows = useMemo(
    () => buildTimeline({ dateISO, timeZone, rules, exceptions, appointments }),
    [dateISO, timeZone, rules, exceptions, appointments]
  );

  // --- The one number ----------------------------------------------------
  const booked = appointments.filter((a) =>
    ['CONFIRMED', 'HELD', 'PENDING', 'COMPLETED'].includes(a.status)
  );
  const bookedMinutes = booked.reduce(
    (sum, a) => sum + (new Date(a.endAt) - new Date(a.startAt)) / 60_000,
    0
  );
  const gapMinutes = rows.filter((r) => r.kind === 'gap').reduce((sum, r) => sum + r.minutes, 0);
  const fill =
    bookedMinutes + gapMinutes > 0
      ? Math.round((bookedMinutes / (bookedMinutes + gapMinutes)) * 100)
      : 100;
  const takings = booked
    .filter((a) => a.status !== 'HELD')
    .reduce((sum, a) => sum + (a.service?.priceCents ?? 0), 0);

  const next = booked
    .filter((a) => new Date(a.startAt) > new Date() && a.status === 'CONFIRMED')
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0];

  return (
    <div className="pb-28">
      <header className="px-5 pt-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-note text-cocoa">
            {new Intl.DateTimeFormat('he-IL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone,
            }).format(new Date())}
          </p>
          <ExportButton />
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            {/* The display face appears ONCE on this screen, on the number the
                barber actually acts on. Anywhere else it would be friction. */}
            <span className="font-display text-[3.4rem] font-semibold leading-none text-espresso">
              <Num>{fill}%</Num>
            </span>
            <p className="mt-1 text-note text-cocoa">מהיום תפוס</p>
          </div>
          <div className="text-end">
            <Price cents={takings} className="text-price font-semibold text-mint-deep" />
            <p className="mt-1 text-micro text-haze">
              <Num>{booked.length}</Num> תורים
            </p>
          </div>
        </div>

        {next && (
          <div className="mt-5 flex items-center gap-3 rounded-plate bg-white px-4 py-3 shadow-pop">
            <span className="h-2 w-2 shrink-0 rounded-full bg-mint" />
            <p className="min-w-0 flex-1 truncate text-note text-cocoa">
              הבא בתור: <span className="font-semibold text-espresso">{next.client.name}</span>{' '}
              בשעה <Num>{formatClock(next.startAt, timeZone)}</Num>
            </p>
            <span className="shrink-0 text-micro text-haze">
              עוד <Num>{Math.max(0, Math.round((new Date(next.startAt) - Date.now()) / 60_000))}</Num> דק׳
            </span>
          </div>
        )}
      </header>

      <div className="mt-6">
        {loading && <div className="mx-5 h-44 animate-breathe rounded-plate bg-shell" />}

        {!loading && rows.length === 0 && (
          <div className="mx-5 rounded-glass border-2 border-dashed border-sand px-5 py-10 text-center">
            <p className="font-display text-d3 font-semibold text-espresso">אין תורים היום</p>
            <p className="he-body mt-3 text-note text-cocoa">
              היום סגור. פתחו שעות מהכפתור למטה — מי שברשימה יקבל הודעה מיד.
            </p>
          </div>
        )}

        {rows.map((row) => (
          <Row
            key={`${row.kind}-${row.start.toISOString()}`}
            row={row}
            timeZone={timeZone}
            onTap={() => setTarget(row)}
            onDelete={row.kind === 'appointment' ? () => remove(row.appointment.id) : undefined}
          />
        ))}
      </div>

      <SlotSheet
        barber={barber}
        row={target}
        timeZone={timeZone}
        onClose={() => setTarget(null)}
        onChanged={() => {
          setTarget(null);
          load();
        }}
        onBlockRange={(gap) => {
          setTarget(null);
          setBlockRange(gap);
        }}
      />

      <TimeRangeSheet
        open={Boolean(blockRange)}
        mode="block"
        bounds={blockRange ? { start: blockRange.start, end: blockRange.end } : null}
        timeZone={timeZone}
        granularityMin={barber?.slotGranularityMin ?? 15}
        onClose={() => setBlockRange(null)}
        onChanged={() => {
          setBlockRange(null);
          load();
        }}
      />
    </div>
  );
}

const STATUS_HE = {
  CONFIRMED: 'מאושר',
  COMPLETED: 'הסתיים',
  PENDING: 'ממתין',
  NO_SHOW: 'לא הגיע',
  CANCELLED: 'בוטל',
};

/**
 * One row.
 *
 * The rail at the START of the row (the RIGHT, in RTL) is the status
 * indicator — a material, not a badge. Solid mint is money in the book, a
 * moving citrus dash is a hold ticking down, dashed sand is an opening.
 */
function Row({ row, timeZone, onTap, onDelete }) {
  const time = formatClock(row.start, timeZone);

  if (row.kind === 'gap') {
    return (
      <button
        type="button"
        onClick={onTap}
        className="flex w-full items-stretch gap-3.5 px-5 py-3.5 text-start transition-colors duration-300 ease-lux active:bg-shell"
      >
        <span className="w-12 shrink-0 pt-0.5 text-end text-note text-haze">
          <Num>{time}</Num>
        </span>
        <span
          className="w-1 shrink-0 rounded-pill"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, #323D3A 0 5px, transparent 5px 11px)',
          }}
        />
        <span className="flex flex-1 items-center justify-between gap-3 py-1">
          <span className="text-note text-cocoa">פנוי · {durationLabel(row.minutes)}</span>
          <span className="rounded-pill bg-pomegranate px-3.5 py-1.5 text-micro font-semibold text-white">
            למלא
          </span>
        </span>
      </button>
    );
  }

  if (row.kind === 'block') {
    return (
      <div className="flex items-stretch gap-3.5 px-5 py-3">
        <span className="w-12 shrink-0 pt-0.5 text-end text-note text-haze">
          <Num>{time}</Num>
        </span>
        <span className="w-1 shrink-0 rounded-pill bg-sand" />
        <span className="py-1 text-note text-haze">חסום · {durationLabel(row.minutes)}</span>
      </div>
    );
  }

  const a = row.appointment;
  const held = a.status === 'HELD';
  const seconds = held && a.holdExpiresAt ? secondsUntil(a.holdExpiresAt) : null;
  // The same red the client is staring at, at the same moment.
  const critical = seconds !== null && seconds <= 60;

  const rail = {
    CONFIRMED: 'bg-mint',
    COMPLETED: 'bg-sand',
    PENDING: 'bg-azure',
    NO_SHOW: 'bg-haze',
    CANCELLED: 'bg-sand',
  }[a.status];

  return (
    <div className="flex items-center">
    <button
      type="button"
      onClick={onTap}
      className="flex min-w-0 flex-1 items-stretch gap-3.5 py-3.5 ps-5 pe-2 text-start transition-colors duration-300 ease-lux active:bg-shell"
    >
      <span className="w-12 shrink-0 pt-0.5 text-end text-note text-cocoa">
        <Num>{time}</Num>
      </span>

      {held ? (
        <span
          className="w-1 shrink-0 animate-ticking rounded-pill"
          style={{
            backgroundImage: `repeating-linear-gradient(to bottom, ${
              critical ? '#E7AE86' : '#C8A052'
            } 0 6px, transparent 6px 12px)`,
          }}
        />
      ) : (
        <span className={`w-1 shrink-0 rounded-pill ${rail}`} />
      )}

      <span className="flex flex-1 items-start justify-between gap-3">
        <span className="min-w-0">
          <span
            className={[
              'block truncate text-base font-semibold',
              a.status === 'NO_SHOW' ? 'text-haze line-through' : 'text-espresso',
              a.status === 'COMPLETED' ? 'text-cocoa' : '',
            ].join(' ')}
          >
            {a.client.name}
            {a.client.vip && (
              <span className="ms-2 rounded-pill bg-grape-soft px-2 py-0.5 text-micro font-semibold text-grape-deep">
                VIP
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-note text-cocoa">
            {a.service.name} · {durationLabel(row.minutes)}
          </span>
        </span>

        <span className="shrink-0 text-end">
          {held ? (
            <>
              <span
                className={`block text-base font-semibold ${
                  critical ? 'text-pomegranate-deep' : 'text-citrus-deep'
                }`}
              >
                <Num>{clockLabel(seconds)}</Num>
              </span>
              <span className="mt-0.5 block text-micro text-haze">ממתין לאישור</span>
            </>
          ) : (
            <>
              <Price cents={a.service.priceCents ?? 0} className="block text-note font-semibold text-mint-deep" />
              <span className="mt-0.5 block text-micro text-haze">{STATUS_HE[a.status]}</span>
            </>
          )}
        </span>
      </span>
    </button>
      {onDelete && (
        <span className="pe-3">
          <DeleteButton label={`מחיקת התור של ${a.client.name}`} onDelete={onDelete} />
        </span>
      )}
    </div>
  );
}
