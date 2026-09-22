import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';

/**
 * ===========================================================================
 *  גיליון חי — every appointment in Excel or Google Sheets, updating itself
 * ===========================================================================
 *
 * A permanent, private CSV link. The spreadsheet re-fetches it on its own —
 * Google Sheets about once an hour, Excel on the schedule set in its
 * refresh settings — so the barber's sheet stays current without exporting.
 *
 * The link IS the key: anyone who has it can read the appointments and the
 * clients' contact details. So it can be reset — a new link at once, and every
 * spreadsheet using the old one stops updating.
 */
export default function SheetFeed() {
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    admin
      .sheetFeed()
      .then(setLinks)
      .catch((err) => setError(err.message));
  }, []);

  async function copy(which, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setError('ההעתקה לא הצליחה — אפשר לסמן את הטקסט ולהעתיק ידנית.');
    }
  }

  async function reset() {
    setConfirmReset(false);
    setError(null);
    try {
      setLinks(await admin.resetSheetFeed());
      setNotice('נוצר קישור חדש. גיליונות שמשתמשים בקישור הקודם הפסיקו להתעדכן — צריך להדביק בהם את החדש.');
    } catch (err) {
      setError(err.message);
    }
  }

  // Rewrites A1 with a new cache-busting parameter on every open (and on a
  // timer, if the barber adds one). The server ignores the extra &t=…
  const script = links
    ? [
        `const FEED = '${links.google}';`,
        '',
        'function refreshAppointments() {',
        "  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];",
        "  sheet.getRange('A1').setFormula('=IMPORTDATA(\"' + FEED + '&t=' + Date.now() + '\")');",
        '}',
        '',
        'function onOpen() {',
        '  refreshAppointments();',
        '}',
      ].join('\n')
    : '';

  const code = 'block w-full overflow-x-auto whitespace-nowrap rounded-plate border-2 border-sand bg-white px-3 py-3 font-mono text-micro text-espresso';
  const copyButton = 'mt-2 w-full touch-manipulation rounded-pill border-2 border-sand bg-white py-3 text-base font-semibold text-espresso transition-transform duration-300 active:scale-[0.98]';

  return (
    <div className="px-5 pb-28 pt-5">
      <h1 className="font-display text-d3 font-semibold text-espresso">גיליון חי</h1>
      <p className="he-body mt-2 text-note text-cocoa">
        כל התורים בגיליון Excel או Google Sheets שמתעדכן לבד. מחברים פעם אחת — והגיליון מושך את הנתונים מחדש בעצמו.
      </p>

      {error && <p role="alert" className="mt-5 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-plate bg-mint-soft px-4 py-3 text-note text-mint-deep">{notice}</p>}
      {!links && !error && <div className="mt-6 h-72 animate-breathe rounded-plate bg-shell" />}

      {links && (
        <>
          <section className="mt-6 rounded-plate border-2 border-sand bg-white p-4">
            <h2 className="text-base font-semibold text-espresso">Google Sheets</h2>
            <ol className="he-body mt-2 list-inside list-decimal space-y-1 text-note text-cocoa">
              <li>פותחים גיליון חדש ב־Google Sheets.</li>
              <li>מדביקים את הנוסחה בתא A1.</li>
              <li>Google מרענן בעצמו בערך פעם בשעה. לרענון בכל פתיחה — הסקריפט שלמטה.</li>
            </ol>
            <code dir="ltr" className={`${code} mt-3`}>{links.formula}</code>
            <button type="button" onClick={() => copy('formula', links.formula)} className={copyButton}>
              {copied === 'formula' ? 'הנוסחה הועתקה ✓' : 'העתקת הנוסחה'}
            </button>
          </section>

          <section className="mt-4 rounded-plate border-2 border-sand bg-white p-4">
            <h2 className="text-base font-semibold text-espresso">Google Sheets — רענון בכל פתיחה</h2>
            <p className="he-body mt-1 text-note text-cocoa">
              Google שומר את הנתונים במטמון שלו ומתעלם מהוראות הרענון של השרת, ואסור להכניס NOW() לתוך IMPORTDATA. מה שכן עובד:
              סקריפט קטן שכותב את הנוסחה מחדש בכל פתיחה — וזה מכריח את Google למשוך נתונים טריים.
            </p>
            <ol className="he-body mt-2 list-inside list-decimal space-y-1 text-note text-cocoa">
              <li>בגיליון: הרחבות ← Apps Script (Extensions ← Apps Script).</li>
              <li>מוחקים את מה שיש שם, מדביקים את הקוד ושומרים.</li>
              <li>מעכשיו, כל פתיחה של הגיליון מושכת את התורים מחדש.</li>
              <li>לרענון גם כשהגיליון פתוח: טריגרים ← הוספת טריגר ← refreshAppointments ← לפי זמן ← כל 15 דקות (אישור חד־פעמי).</li>
            </ol>
            <pre dir="ltr" className={`${code} mt-3 whitespace-pre text-start`}>{script}</pre>
            <button type="button" onClick={() => copy('script', script)} className={copyButton}>
              {copied === 'script' ? 'הסקריפט הועתק ✓' : 'העתקת הסקריפט'}
            </button>
          </section>

          <section className="mt-4 rounded-plate border-2 border-sand bg-white p-4">
            <h2 className="text-base font-semibold text-espresso">Microsoft Excel</h2>
            <ol className="he-body mt-2 list-inside list-decimal space-y-1 text-note text-cocoa">
              <li>נתונים ← מהאינטרנט (Data ← From Web), ומדביקים את הקישור.</li>
              <li>״טען״ (Load) — התורים נכנסים כטבלה.</li>
              <li>
                לרענון אוטומטי: נתונים ← שאילתות וחיבורים ← מאפיינים, ומסמנים ״רענן כל 60 דקות״ ו״רענן נתונים בעת פתיחת הקובץ״.
              </li>
              <li>אם העברית נראית משובשת, בוחרים בתצוגה המקדימה קידוד 65001: Unicode (UTF-8).</li>
            </ol>
            <code dir="ltr" className={`${code} mt-3`}>{links.url}</code>
            <button type="button" onClick={() => copy('url', links.url)} className={copyButton}>
              {copied === 'url' ? 'הקישור הועתק ✓' : 'העתקת הקישור'}
            </button>
          </section>

          <div className="mt-6 rounded-plate border-2 border-citrus/50 bg-citrus-soft px-4 py-4">
            <p className="text-note font-semibold text-citrus-deep">הקישור פרטי</p>
            <p className="he-body mt-1 text-note text-cocoa">מי שמחזיק בו רואה את כל התורים ואת פרטי הקשר של הלקוחות. אם נשלח בטעות — מאפסים:</p>
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
        </>
      )}
    </div>
  );
}
