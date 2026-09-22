import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';

/**
 * ===========================================================================
 *  היומן בטלפון — every appointment in the phone's own calendar
 * ===========================================================================
 *
 * A private subscription link (iCalendar). The phone's calendar app fetches it
 * on its own schedule — iPhone about every 15 minutes, Google Calendar every
 * few hours — so new bookings appear, and cancellations disappear, by themselves.
 *
 * The link IS the key: anyone who has it can see the appointments. So it can be
 * reset — a new link at once, and every old copy stops working.
 */
export default function CalendarFeed() {
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    admin
      .calendarFeed()
      .then(setLinks)
      .catch((err) => setError(err.message));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(links.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('ההעתקה לא הצליחה — אפשר לסמן את הקישור ולהעתיק ידנית.');
    }
  }

  async function reset() {
    setConfirmReset(false);
    setError(null);
    try {
      setLinks(await admin.resetCalendarFeed());
      setNotice('נוצר קישור חדש. הקישור הקודם כבר לא עובד — צריך להוסיף את החדש ליומן מחדש.');
    } catch (err) {
      setError(err.message);
    }
  }

  const button = 'flex w-full touch-manipulation items-center justify-center rounded-pill py-3.5 text-base font-semibold transition-[transform,opacity] duration-300 ease-lux active:scale-[0.98]';

  return (
    <div className="px-5 pb-28 pt-5">
      <h1 className="font-display text-d3 font-semibold text-espresso">היומן בטלפון</h1>
      <p className="he-body mt-2 text-note text-cocoa">
        כל התורים מופיעים ביומן של הטלפון, ומתעדכנים לבד: תור חדש נכנס, תור שבוטל נעלם. באייפון בערך כל רבע שעה, ב־Google
        Calendar כל כמה שעות.
      </p>

      {error && <p role="alert" className="mt-5 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-plate bg-mint-soft px-4 py-3 text-note text-mint-deep">{notice}</p>}
      {!links && !error && <div className="mt-6 h-56 animate-breathe rounded-plate bg-shell" />}

      {links && (
        <div className="mt-6 space-y-3">
          <a href={links.webcal} className={`${button} bg-espresso text-cream shadow-pop`}>
            הוספה ליומן באייפון
          </a>
          <a href={links.google} target="_blank" rel="noopener noreferrer" className={`${button} border-2 border-sand bg-white text-espresso`}>
            הוספה ל־Google Calendar
          </a>
          <button type="button" onClick={copy} className={`${button} border-2 border-sand bg-white text-cocoa`}>
            {copied ? 'הקישור הועתק ✓' : 'העתקת הקישור (Outlook ואחרים)'}
          </button>

          <div className="!mt-8 rounded-plate border-2 border-citrus/50 bg-citrus-soft px-4 py-4">
            <p className="text-note font-semibold text-citrus-deep">הקישור פרטי</p>
            <p className="he-body mt-1 text-note text-cocoa">מי שמחזיק בו רואה את התורים ושמות הלקוחות. אם נשלח בטעות — מאפסים:</p>
            {confirmReset ? (
              <span className="mt-3 flex items-center gap-2">
                <button type="button" onClick={reset} className="rounded-pill bg-citrus px-4 py-2 text-micro font-semibold text-white">
                  כן, ליצור קישור חדש
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className="px-2 text-micro text-haze">
                  ביטול
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="mt-3 rounded-pill border-2 border-sand px-4 py-2 text-micro font-semibold text-cocoa">
                איפוס הקישור
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
