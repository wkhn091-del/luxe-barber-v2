import { useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import { admin } from '../lib/adminApi.js';
import { Num, Price, formatClock } from '../lib/bidi.jsx';
import { durationLabel } from '../lib/schedule.js';
import { confirmationText, reminderText, offerText, helloText, whenPhrase } from '../lib/whatsapp.js';
import { WhatsAppPanel } from './WhatsApp.jsx';
import DeleteButton from './DeleteButton.jsx';

/**
 * ===========================================================================
 *  פעולות על משבצת זמן
 * ===========================================================================
 *
 * Every write the barber can make from the timeline lives here, so the rules
 * about confirmation live in one place too:
 *
 *   - ADDING availability is one tap. It can only create bookings, and the
 *     waitlist engine fills it the instant the row lands.
 *   - REMOVING availability or resolving an appointment takes two. Blocking an
 *     hour that has a booking inside returns 409 from the server, and the sheet
 *     shows WHO is in the way rather than just refusing.
 *   - BROADCASTING takes two, with the recipient count and the exact message on
 *     screen before the send.
 *   - MESSAGING is free and manual. Email goes out on its own; WhatsApp is the
 *     barber's own tap, with the Hebrew message pre-written and shown in full
 *     before anything opens.
 *
 * Note what is NOT red. In the bright palette pomegranate is a brand colour, so
 * destructive confirms are plain bordered plates with an unambiguous Hebrew
 * verb on the button. Red is reserved for the two places it carries meaning: a
 * hold about to expire, and an empty gap asking to be filled.
 */
export default function SlotSheet({ row, timeZone, barber, onClose, onChanged, onBlockRange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [flash, setFlash] = useState(null); // null | 'review' | 'sent'
  const [sentCount, setSentCount] = useState(0);

  if (!row) return null;

  const reset = () => {
    setBusy(null);
    setError(null);
    setConflicts(null);
    setFlash(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const Range = () => (
    <span className="text-base font-semibold text-espresso">
      <Num>{formatClock(row.start, timeZone)}</Num>
      <span className="mx-1.5 text-haze" aria-hidden="true">–</span>
      <Num>{formatClock(row.end, timeZone)}</Num>
    </span>
  );

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      reset();
      onChanged();
    } catch (err) {
      if (err.code === 'HAS_APPOINTMENTS') setConflicts(err.details ?? []);
      else setError(err.message);
      setBusy(null);
    }
  }

  // ------------------------------------------------------------- a gap ---

  if (row.kind === 'gap') {
    if (flash === 'sent') {
      const reached = sentCount > 0;
      return (
        <Sheet open onClose={close} title={null}>
          <div className="pb-6 pt-2 text-center">
            <span
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-pill ${reached ? 'bg-mint' : 'bg-citrus'}`}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {reached ? (
                  <path d="M5 12.5 10 17.5 19 7" stroke="#0B1110" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M12 7v6M12 17h.01" stroke="#0B1110" strokeWidth="2.4" strokeLinecap="round" />
                )}
              </svg>
            </span>
            <h2 className="mt-6 font-display text-d3 font-semibold text-espresso">
              {reached ? (
                <>
                  נשלח במייל ל־<Num>{sentCount}</Num> לקוחות
                </>
              ) : (
                'אין למי לשלוח במייל'
              )}
            </h2>
            <p className="he-body mt-4 text-note text-cocoa">
              {reached
                ? 'מי שיקבע ראשון מקבל את התור — שום דבר לא נשמר. תראו את זה נוחת על היומן.'
                : 'לאף לקוח שמתאים לשליחה אין כתובת מייל. הזמן נשאר פתוח באתר, ואפשר לכתוב לקבועים בוואטסאפ.'}
            </p>
            <button
              type="button"
              onClick={() => {
                reset();
                onChanged();
              }}
              className="mt-8 w-full rounded-pill border-2 border-sand bg-white py-3.5 text-base font-semibold text-espresso"
            >
              חזרה ליומן
            </button>
          </div>
        </Sheet>
      );
    }

    if (flash === 'review') {
      const when = whenPhrase(row.start, timeZone);
      return (
        <Sheet open onClose={close} title="שליחת התראה">
          <div className="space-y-6 pb-4">
            <Range />

            {/* The email, verbatim — subject line and opening. Nobody should
                message a hundred people without reading what they will get. */}
            <blockquote className="rounded-plate border-2 border-sand bg-shell px-4 py-4 text-note leading-relaxed text-cocoa">
              <p className="font-semibold text-espresso">
                התפנה תור {when} ב־<Num>{formatClock(row.start, timeZone)}</Num>
              </p>
              <p className="mt-1.5">
                <span className="rounded-md bg-sand px-1.5 py-0.5 text-micro font-semibold text-cocoa">שם הלקוח</span>, התפנה
                כיסא {when} ב־<Num>{formatClock(row.start, timeZone)}</Num>. מי שקובע ראשון — מקבל.
              </p>
            </blockquote>

            <div className="space-y-2 text-note text-cocoa">
              <p>נשלח במייל ללקוחות קודמים שאישרו לקבל עדכונים.</p>
              <p className="text-haze">
                מי שקיבל הודעה ב־<Num>72</Num> השעות האחרונות מדולג אוטומטית.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={busy === 'flash'}
              onClick={async () => {
                setBusy('flash');
                setError(null);
                try {
                  const res = await admin.flash(row.start.toISOString(), row.end.toISOString());
                  setSentCount(res.recipientCount);
                  // Stay in the sheet: "how many did that actually reach" is
                  // the one thing worth showing after a broadcast.
                  setFlash('sent');
                } catch (err) {
                  setError(err.message);
                } finally {
                  setBusy(null);
                }
              }}
              className="w-full rounded-pill bg-pomegranate py-4 text-base font-semibold text-white shadow-pop disabled:opacity-40"
            >
              {busy === 'flash' ? 'שולחים…' : 'לשלוח עכשיו'}
            </button>

            <button type="button" onClick={() => setFlash(null)} className="w-full py-2 text-note text-cocoa">
              עוד לא
            </button>
          </div>
        </Sheet>
      );
    }

    return (
      <Sheet open onClose={close} title={`פנוי · ${durationLabel(row.minutes)}`}>
        <div className="space-y-3 pb-4">
          <Range />
          <p className="pb-2 text-note text-cocoa">אף אחד לא קבוע. שלוש דרכים להשתמש בזמן הזה.</p>

          <Action
            accent="bg-pomegranate"
            title="לשלוח התראה ללקוחות"
            note="מייל לכל מי שאישר לקבל. מי שקובע ראשון מקבל."
            onClick={() => setFlash('review')}
          />
          <Action
            title="לחסום את כל הזמן"
            note={`מוציא את כל ה־${durationLabel(row.minutes)} מהיומן.`}
            onClick={() => run('block', () => admin.blockHours(row.start.toISOString(), row.end.toISOString()))}
            busy={busy === 'block'}
          />
          {/* The case that actually comes up: a three-hour hole in the
              afternoon and the barber wants half an hour of it for lunch. */}
          <Action
            title="לחסום רק חלק"
            note="בוחרים שעת התחלה ואורך — להפסקה או לסידורים."
            onClick={() => onBlockRange?.(row)}
          />
          <Action title="להשאיר פנוי" note="נשאר פתוח להזמנה באתר." onClick={close} />

          {error && (
            <p role="alert" className="pt-2 text-note text-pomegranate-deep">
              {error}
            </p>
          )}
        </div>
      </Sheet>
    );
  }

  // ----------------------------------------------------------- a block ---

  if (row.kind === 'block') {
    return (
      <Sheet open onClose={close} title={`חסום · ${durationLabel(row.minutes)}`}>
        <div className="space-y-3 pb-4">
          <Range />
          <p className="he-body pb-2 text-note text-cocoa">
            פתיחה מחדש מעבירה את הזמן הזה ישר לרשימה — הראשון שמתאים מקבל הודעה תוך שניות.
          </p>
          <Action
            accent="bg-mint"
            title="לפתוח מחדש"
            note="חוזר לאתר ומוצע מיד לרשימת ההמתנה."
            onClick={() => run('unblock', () => admin.removeException(row.blockId))}
            busy={busy === 'unblock'}
          />
          {error && (
            <p role="alert" className="text-note text-pomegranate-deep">
              {error}
            </p>
          )}
        </div>
      </Sheet>
    );
  }

  // ----------------------------------------------------- an appointment ---

  const a = row.appointment;
  const shop = { name: barber?.name, address: barber?.addressLine };
  const messages = whatsappMessages(a, shop, timeZone);
  // Inside the last day a reminder is the natural message; before that, the
  // confirmation. The barber can switch either way.
  const soon = new Date(a.startAt).getTime() - Date.now() < 24 * 3600_000;

  return (
    <Sheet open onClose={close} title={a.client.name}>
      <div className="space-y-5 pb-4">
        <div>
          <Range />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-note text-cocoa">
            <span>{a.service.name}</span>
            <span aria-hidden="true">·</span>
            <Price cents={a.service.priceCents ?? 0} />
            <span aria-hidden="true">·</span>
            <span>מזומן במקום</span>
          </p>
        </div>

        <div className="flex gap-2.5">
          <a
            href={`tel:${a.client.phone}`}
            className="flex-1 rounded-plate border-2 border-sand bg-white py-3 text-center text-note font-semibold text-espresso"
          >
            חיוג
          </a>
          <a
            href={`sms:${a.client.phone}`}
            className="flex-1 rounded-plate border-2 border-sand bg-white py-3 text-center text-note font-semibold text-espresso"
          >
            SMS
          </a>
        </div>

        <WhatsAppPanel
          key={a.id}
          phone={a.client.phone}
          email={a.client.email}
          options={messages}
          initial={soon && a.status !== 'HELD' ? 'remind' : undefined}
        />

        {a.client.noShowCount > 0 && (
          <p className="rounded-plate bg-citrus-soft px-4 py-3 text-note text-citrus-deep">
            <Num>{a.client.noShowCount}</Num> פעמים שלא הגיע/ה בעבר.
          </p>
        )}

        {a.status === 'HELD' ? (
          <p className="he-body rounded-plate bg-shell px-4 py-4 text-note text-cocoa">
            זו שמירה מרשימת ההמתנה. הלקוח מאשר בעצמו מהקישור, או שהתור עובר לבא בתור כשייגמר הזמן.
            {a.offer?.token && ' רוצים לזרז? שלחו לו את הקישור בוואטסאפ.'}
          </p>
        ) : (
          <div className="space-y-3">
            <Action
              accent="bg-mint"
              title="הסתיים"
              note="מסמן שהתספורת בוצעה."
              onClick={() => run('done', () => admin.setAppointmentStatus(a.id, 'COMPLETED'))}
              busy={busy === 'done'}
            />
            <Action
              title="לא הגיע"
              note="נרשם אצל הלקוח כאי-הגעה."
              onClick={() => run('noshow', () => admin.setAppointmentStatus(a.id, 'NO_SHOW'))}
              busy={busy === 'noshow'}
            />
            <Action
              title="לבטל את התור"
              note="משחרר את הזמן ומציע אותו מיד לרשימה."
              onClick={() => run('cancel', () => admin.setAppointmentStatus(a.id, 'CANCELLED'))}
              busy={busy === 'cancel'}
            />
          </div>
        )}

        {/* Not the same as cancelling: no message, no waitlist offer. For test
            bookings and demo data. */}
        <div className="flex items-center justify-between gap-3 rounded-plate border-2 border-sand bg-white p-4">
          <span className="min-w-0">
            <span className="block text-base font-semibold text-espresso">מחיקה לצמיתות</span>
            <span className="mt-0.5 block text-note text-cocoa">בלי הודעה ללקוח ובלי הצעה לרשימה — לניקוי תורי דמו.</span>
          </span>
          <DeleteButton
            label="מחיקת התור לצמיתות"
            onDelete={async () => {
              await admin.deleteAppointment(a.id);
              reset();
              onChanged();
            }}
          />
        </div>

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
            <p className="mt-3 text-note text-citrus-deep">צריך להזיז או לבטל אותם קודם.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-note text-pomegranate-deep">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The WhatsApp messages that make sense for this appointment's state.
 *   HELD                → the live offer and its confirm link (needs the token)
 *   CONFIRMED / PENDING → a confirmation and a reminder
 *   anything else       → a plain hello; the history is not a script
 */
function whatsappMessages(a, shop, tz) {
  const client = a.client;

  if (a.status === 'HELD') {
    if (!a.offer?.token) return [];
    return [
      {
        key: 'offer',
        label: 'הצעת התור',
        text: offerText({
          client,
          service: a.service,
          slotStartAt: a.startAt,
          expiresAt: a.offer.expiresAt ?? a.holdExpiresAt,
          token: a.offer.token,
          shop,
          tz,
        }),
      },
    ];
  }

  if (a.status === 'CONFIRMED' || a.status === 'PENDING') {
    return [
      { key: 'confirm', label: 'אישור תור', text: confirmationText({ client, service: a.service, startAt: a.startAt, shop, tz }) },
      { key: 'remind', label: 'תזכורת', text: reminderText({ client, service: a.service, startAt: a.startAt, shop, tz }) },
    ];
  }

  return [{ key: 'hello', label: 'הודעה', text: helloText({ client, shop }) }];
}

/**
 * One tap target. 64px tall with the explanation inline — a barber holding
 * clippers should never have to guess what a button does, and there is no room
 * on a phone for a tooltip.
 */
function Action({ title, note, onClick, busy, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={[
        'flex w-full items-center gap-3.5 rounded-plate border-2 border-sand bg-white p-4 text-start',
        'transition-[border-color,transform] duration-300 ease-lux active:scale-[0.99] hover:border-cocoa/40',
        busy ? 'opacity-50' : '',
      ].join(' ')}
    >
      {accent && <span className={`h-9 w-1.5 shrink-0 rounded-pill ${accent}`} />}
      <span className="min-w-0">
        <span className="block text-base font-semibold text-espresso">{busy ? 'רגע…' : title}</span>
        <span className="mt-0.5 block text-note text-cocoa">{note}</span>
      </span>
    </button>
  );
}
