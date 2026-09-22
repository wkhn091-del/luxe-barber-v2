import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Num } from '../lib/bidi.jsx';
import { waLink } from '../lib/whatsapp.js';
import { displayPhone, wazeFor } from '../lib/phone.js';
import InstallPrompt, { InstallButton } from '../pwa/InstallPrompt.jsx';

/**
 * ===========================================================================
 *  שאלות נפוצות
 * ===========================================================================
 *
 * Every number on this page — how long an offer is held, how late a booking
 * can be made, how many missed offers close a waitlist place — comes from the
 * shop's own settings through GET /api/shop. Change a setting and the page
 * says the new thing; nothing here can drift out of date. Until the settings
 * arrive, or if they can't, answers are phrased without the number rather
 * than with a guess.
 *
 * The answers describe what the system actually does. Where there is no
 * self-service path (cancelling, leaving the waitlist), they say to reply or
 * call — because that IS the path.
 *
 * Each answer is a native <details>: keyboard- and screen-reader-accessible
 * for free, and it works before any JavaScript has run. A link to
 * /help#waitlist-window opens that answer directly.
 */

const TITLE = 'שאלות נפוצות · לוקסי';

/** 30 → "חצי שעה" · 60 → "שעה" · 120 → "שעתיים" · 180 → "3 שעות" · 45 → "45 דקות" */
function duration(min) {
  if (min === 30) return 'חצי שעה';
  if (min === 60) return 'שעה';
  if (min === 120) return 'שעתיים';
  if (min % 60 === 0) return <><Num>{min / 60}</Num> שעות</>;
  return <><Num>{min}</Num> דקות</>;
}

const LINK = 'text-gold-lit underline decoration-gold/40 underline-offset-4 transition-colors duration-300 hover:text-ivory';

export default function Help() {
  const [shop, setShop] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .shop()
      .then((data) => alive && setShop(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // /help#waitlist-window — open that answer and bring it into view. Keyed
  // on the router's hash, so it also works when the link is followed from
  // inside the app, where no page load (and no hashchange event) happens.
  const { hash } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ block: 'start' });
    }
  }, [hash]);

  const ttl = shop?.offerTtlMin;
  const lead = shop?.minLeadTimeMin;
  const misses = shop?.maxMissedOffers;
  const phone = shop?.phone ? displayPhone(shop.phone) : null;

  return (
    <div className="relative min-h-[100dvh] bg-onyx">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[30rem]"
        style={{ background: 'radial-gradient(70% 60% at 50% 0%, rgba(255,201,138,0.09), rgba(255,201,138,0) 70%)' }}
      />

      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-5 pt-6 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width="28" height="28" className="h-7 w-7" />
          <span className="font-display text-lead font-semibold text-ivory">לוקסי</span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-note text-champagne transition-colors duration-300 hover:border-gold/60 hover:text-ivory"
        >
          {/* In RTL "back" points right, toward where the reader came from. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          חזרה לאתר
        </Link>
      </header>

      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-d2 font-semibold text-ivory">שאלות נפוצות</h1>
        <p className="he-body mt-4 max-w-xl text-lead text-champagne">
          כל מה שכדאי לדעת לפני שמגיעים לכיסא. חסר משהו? התשובה בוואטסאפ, למטה.
        </p>

        <Section title="קביעת תור">
          <Item id="how-to-book" q="איך קובעים תור?">
            בוחרים טיפול מהתפריט, בוחרים יום ושעה פנויים, ומשאירים שם וטלפון. התור נקבע מיד — בלי לחכות
            לאישור.{' '}
            <a href="/#menu" className={LINK}>
              לתפריט הטיפולים
            </a>
          </Item>
          <Item id="lead-time" q="עד מתי אפשר לקבוע?">
            {lead ? <>עד {duration(lead)} לפני התור, כל עוד השעה פנויה. </> : 'כל עוד השעה פנויה ביומן. '}
            השעות שביומן הן השעות הפנויות באמת, ברגע זה — מה שמופיע, אפשר לקבוע.
          </Item>
          <Item id="payment" q="צריך לשלם מראש?">
            לא. אין מקדמה ואין צורך בכרטיס אשראי — משלמים במזומן, במקום.
          </Item>
          <Item id="confirmation" q="איך אדע שהתור נקבע?">
            מיד אחרי הקביעה מופיעים על המסך כל פרטי התור. השארתם מייל? נשלח אליו אישור עם קובץ ליומן, ותזכורת
            יום לפני ושוב כשעתיים לפני. בלי מייל — נאשר מולכם בוואטסאפ.
          </Item>
        </Section>

        <Section title="רשימת ההמתנה">
          <Item id="waitlist" q="השבוע מלא. מה עושים?">
            נכנסים לרשימת ההמתנה: בוחרים טיפול, ימים ושעות שנוחים לכם. כשמתפנה תור שמתאים, הוא מוצע לבא ברשימה —
            ואתם מקבלים הודעה עם קישור לאישור בלחיצה אחת.
          </Item>
          <Item
            id="waitlist-window"
            q={ttl ? <>למה ההצעה שמורה רק <Num>{ttl}</Num> דקות?</> : 'כמה זמן ההצעה שמורה לי?'}
          >
            {ttl ? (
              <>
                כדי שתור שהתפנה לא יישאר ריק. ההצעה שמורה בשבילכם <Num>{ttl}</Num> דקות בדיוק, ובהודעה כתוב עד מתי.{' '}
              </>
            ) : (
              'ההצעה שמורה בשבילכם לזמן קצר, ובהודעה כתוב בדיוק עד מתי. '
            )}
            לא הספקתם? היא עוברת אוטומטית לבא ברשימה, ואתם נשארים ברשימה לפעם הבאה.
            {misses ? (
              <>
                {' '}
                אחרי <Num>{misses}</Num> הצעות שלא נענו ההרשמה נסגרת — ואפשר להירשם מחדש בכל רגע.
              </>
            ) : null}
          </Item>
          <Item id="waitlist-leave" q="איך יוצאים מרשימת ההמתנה?">
            השיבו למייל שקיבלתם מאיתנו, או כתבו לנו בוואטסאפ — ונוריד אתכם מיד.
          </Item>
        </Section>

        <Section title="ביטול ושינוי">
          <Item id="cancel" q="איך מבטלים או מזיזים תור?">
            השיבו למייל האישור, או התקשרו או כתבו לנו בוואטסאפ
            {phone ? (
              <>
                {' '}
                (<Num>{phone}</Num>)
              </>
            ) : null}
            . כדאי להודיע מוקדם ככל האפשר: תור שמתבטל מוצע מיד למי שמחכה ברשימה.
          </Item>
        </Section>

        <Section title="האפליקציה">
          <Item id="install" q="אפשר להתקין את לוקסי כאפליקציה?">
            כן, ובחינם. באייפון: שיתוף ← הוספה למסך הבית. באנדרואיד ובמחשב: הכפתור כאן, כשהדפדפן מאפשר. האפליקציה
            נפתחת ישר מהמסך הראשי, ואת התפריט והכתובת רואים בה גם בלי קליטה — קביעת תור דורשת חיבור.
            <div className="mt-4">
              <InstallButton />
            </div>
          </Item>
        </Section>

        <Section title="פרטיות">
          <Item id="privacy" q="מה אתם שומרים עליי?">
            שם, טלפון, ומייל אם השארתם — רק כדי לנהל את התורים שלכם ולשלוח את ההודעות עליהם. רוצים לעיין בפרטים
            או למחוק אותם? כתבו לנו.
          </Item>
        </Section>

        <Contact shop={shop} failed={failed} phone={phone} />
      </main>
      <footer className="relative mx-auto flex max-w-3xl justify-center gap-3 px-5 pb-10 text-micro text-haze sm:px-8">
        <Link to="/privacy" className="underline underline-offset-4 hover:text-cocoa">מדיניות פרטיות</Link>
        <span aria-hidden="true">·</span>
        <Link to="/accessibility" className="underline underline-offset-4 hover:text-cocoa">הצהרת נגישות</Link>
      </footer>

      {/* No card of its own here — it opens only when the InstallButton above asks (iOS). */}
      <InstallPrompt auto={false} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-3 text-note font-semibold text-gold-lit">
        <span aria-hidden="true" className="h-px w-6 bg-gold/60" />
        {title}
      </h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Item({ id, q, children }) {
  return (
    <details id={id} className="card group scroll-mt-8 overflow-hidden transition-colors duration-300 open:border-gold/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-ivory [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-pill border border-line text-gold-lit transition-transform duration-300 ease-lux group-open:rotate-45"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div className="he-body px-5 pb-5 text-note leading-relaxed text-champagne">{children}</div>
    </details>
  );
}

function Contact({ shop, failed, phone }) {
  const whatsapp = shop?.phone ? waLink(shop.phone, 'שלום, יש לי שאלה 💈') : null;
  // An address from the database still only becomes a link if it is https.
  const instagram = /^https:\/\//.test(shop?.instagramUrl ?? '') ? shop.instagramUrl : null;
  const button =
    'inline-flex items-center gap-2 rounded-pill border border-line px-5 py-3 text-note font-semibold text-ivory transition-colors duration-300 hover:border-gold/60';

  return (
    <section id="contact" aria-labelledby="contact-title" className="glass mt-14 p-6 sm:p-8">
      <h2 id="contact-title" className="font-display text-d3 font-semibold text-ivory">
        לא מצאתם תשובה?
      </h2>
      <p className="he-body mt-2 text-base text-champagne">כתבו או התקשרו, ונחזור אליכם.</p>

      {!shop && !failed && <div className="mt-6 h-12 w-64 max-w-full animate-breathe rounded-pill bg-graphite" />}
      {failed && <p className="mt-6 text-note text-pewter">לא הצלחנו לטעון את פרטי הקשר. נסו לרענן את הדף.</p>}

      {shop && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-pill bg-gold px-5 py-3 text-note font-semibold text-onyx shadow-pop transition-colors duration-300 hover:bg-gold-lit"
              >
                וואטסאפ
              </a>
            )}
            {phone && (
              <a href={`tel:${shop.phone}`} className={button}>
                חיוג <Num>{phone}</Num>
              </a>
            )}
            {wazeFor(shop) && (
              <a
                href={wazeFor(shop)}
                target="_blank"
                rel="noopener noreferrer"
                className={button}
              >
                ניווט ב־Waze
              </a>
            )}
            {instagram && (
              <a href={instagram} target="_blank" rel="noopener noreferrer" className={button}>
                אינסטגרם
              </a>
            )}
          </div>
          {shop.addressLine && <p className="mt-4 text-note text-pewter">{shop.addressLine}</p>}
        </>
      )}
    </section>
  );
}
