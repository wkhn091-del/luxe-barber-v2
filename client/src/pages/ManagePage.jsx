import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Num, Price, SHOP_TZ } from '../lib/bidi.jsx';
import { displayPhone, wazeFor } from '../lib/phone.js';

/**
 * ===========================================================================
 *  /b/:token — the client's own page for one appointment
 * ===========================================================================
 *
 * Linked from the confirmation and both reminders ("ביטול / ניהול תור"). The
 * token is the key: random and unguessable, it opens exactly this appointment
 * and nothing else.
 *
 * Cancelling here is the same cancellation the system always does — the slot
 * is freed at once and offered to the waitlist — and, because the CLIENT did
 * it, the barber gets an alert email. Once the appointment has started it can
 * no longer be cancelled from here: the page does not offer it, and the server
 * refuses it anyway.
 */
const STATUS = {
  upcoming: ['התור שמור', 'bg-mint-soft text-mint-deep'],
  cancelled: ['בוטל', 'bg-shell text-haze'],
  past: ['התור עבר', 'bg-shell text-haze'],
};

export default function ManagePage() {
  const { token } = useParams();
  const [view, setView] = useState({ phase: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'ניהול התור';
    api
      .appointment(token)
      .then(({ appointment }) => setView({ phase: 'ready', appointment }))
      .catch((err) => setView({ phase: (err.status ?? err.statusCode) === 404 ? 'missing' : 'error', message: err.message }));
    return () => {
      document.title = previous;
    };
  }, [token]);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelAppointment(token);
      setView((v) => ({ ...v, appointment: { ...v.appointment, status: 'CANCELLED' }, justCancelled: true }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const a = view.appointment;
  const shop = a?.barber ?? {};
  const timeZone = shop.timezone && shop.timezone !== 'Europe/Paris' ? shop.timezone : SHOP_TZ;
  const start = a ? new Date(a.startAt) : null;
  const state = !a ? null : a.status === 'CANCELLED' ? 'cancelled' : start <= new Date() || !['CONFIRMED', 'PENDING'].includes(a.status) ? 'past' : 'upcoming';
  const day = start && new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(start);
  const time = start && new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(start);
  const waze = wazeFor(shop);
  const phone = shop.phone ? displayPhone(shop.phone) : null;

  return (
    <div dir="rtl" className="min-h-screen bg-cream text-espresso">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-6">
        <Link to="/" className="font-display text-lead font-semibold text-espresso">
          {shop.name || '\u00a0'}
        </Link>
        <Link to="/" className="rounded-pill border-2 border-sand px-4 py-2 text-note font-semibold text-cocoa transition-colors duration-300 hover:text-espresso">
          לדף הבית
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-20 pt-10">
        {view.phase === 'loading' && <div className="h-80 animate-breathe rounded-sheet bg-shell" />}

        {(view.phase === 'missing' || view.phase === 'error') && (
          <section className="glass rounded-sheet px-6 py-10 text-center">
            <h1 className="font-display text-d3 font-semibold">{view.phase === 'missing' ? 'לא מצאנו את התור' : 'משהו השתבש'}</h1>
            <p className="he-body mt-3 text-note text-cocoa">
              {view.phase === 'missing' ? 'ייתכן שהקישור לא הועתק במלואו. אפשר ללחוץ שוב על הכפתור שבמייל.' : view.message}
            </p>
            <Link to="/" className="mt-6 inline-flex rounded-pill bg-espresso px-6 py-3 text-base font-semibold text-cream">
              לדף הבית
            </Link>
          </section>
        )}

        {view.phase === 'ready' && (
          <section className="glass rounded-sheet px-6 py-8">
            <span className={`inline-block rounded-pill px-3 py-1 text-micro font-semibold ${STATUS[state][1]}`}>{STATUS[state][0]}</span>
            <h1 className="mt-4 font-display text-d3 font-semibold">{a.client?.name ? `${a.client.name}, התור שלך` : 'התור שלך'}</h1>

            <div className={`mt-6 rounded-plate border-2 border-sand px-5 py-5 ${state === 'upcoming' ? '' : 'opacity-60'}`}>
              <p className="text-note font-semibold text-cocoa">{day}</p>
              <p className="figures mt-1 text-[2.6rem] font-semibold leading-none text-espresso">
                <Num>{time}</Num>
              </p>
              <p className="mt-3 text-note text-cocoa">
                {[a.service?.name, a.service?.durationMin ? `${a.service.durationMin} דק׳` : null].filter(Boolean).join(' · ')}
                {a.service?.priceCents != null && (
                  <>
                    {' · '}
                    <Price cents={a.service.priceCents} />
                  </>
                )}
              </p>
              {shop.addressLine && <p className="mt-1 text-note text-cocoa">{shop.addressLine}</p>}
            </div>

            {view.justCancelled && (
              <p role="status" className="mt-6 rounded-plate bg-mint-soft px-4 py-4 text-note text-mint-deep">
                התור בוטל. תודה שעדכנתם — המספרה קיבלה הודעה, והזמן עבר מיד למי שמחכה ברשימה.
              </p>
            )}
            {!view.justCancelled && state === 'cancelled' && <p className="mt-6 text-note text-cocoa">התור הזה בוטל.</p>}
            {state === 'past' && <p className="mt-6 text-note text-cocoa">התור הזה כבר עבר, ולכן אי אפשר לבטל אותו מכאן.</p>}

            {error && (
              <p role="alert" className="mt-6 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
                {error}
              </p>
            )}

            {state === 'upcoming' && (
              <div className="mt-6 space-y-3">
                {waze && (
                  <a href={waze} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center rounded-pill border-2 border-sand py-3.5 text-base font-semibold text-espresso">
                    ניווט ב־Waze
                  </a>
                )}
                {confirming ? (
                  <div className="rounded-plate border-2 border-citrus/60 bg-citrus-soft px-4 py-4">
                    <p className="text-note font-semibold text-espresso">
                      לבטל את התור של {day} ב־<Num>{time}</Num>?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={busy}
                        className="flex-1 touch-manipulation rounded-pill bg-citrus py-3 text-base font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? 'מבטלים…' : 'כן, לבטל'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="flex-1 touch-manipulation rounded-pill border-2 border-sand py-3 text-base font-semibold text-cocoa"
                      >
                        לא, להשאיר
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="w-full touch-manipulation rounded-pill border-2 border-citrus/60 py-3.5 text-base font-semibold text-citrus-deep"
                  >
                    ביטול התור
                  </button>
                )}
                <p className="text-center text-micro text-haze">רוצים מועד אחר? מבטלים כאן וקובעים מחדש באתר.</p>
              </div>
            )}

            {state !== 'upcoming' && (
              <Link to="/" className="mt-6 flex w-full items-center justify-center rounded-pill bg-espresso py-3.5 text-base font-semibold text-cream">
                לקביעת תור חדש
              </Link>
            )}

            {phone && (
              <p className="mt-6 text-center text-note text-cocoa">
                לשאלות:{' '}
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-espresso underline underline-offset-4">
                  <Num>{phone}</Num>
                </a>
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
