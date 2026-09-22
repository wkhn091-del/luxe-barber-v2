import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';

/**
 * ===========================================================================
 *  מדריך למשתמש — the barber's manual, inside the dashboard
 * ===========================================================================
 *
 * The same guide as the printed manual, adapted to the screen: tappable
 * contents, collapsible questions, and copy buttons instead of retyping.
 *
 * Two things are deliberately NOT written into this file:
 *
 *   - The admin password. This component ships in the site's public
 *     JavaScript — anyone can download and read it, logged in or not — and the
 *     server only keeps a hash of the password anyway. The barber is already
 *     signed in when reading this; the password lives in the printed manual.
 *
 *   - The secret sheet link. It is fetched after login from the same endpoint
 *     as "גיליון חי", so it is never in the bundle, and it is always current:
 *     after a reset, this page shows the new formula and script at once.
 */

const SECTIONS = [
  { id: 'manual-access', n: 1, title: 'כניסה למערכת', note: 'מכשיר חדש, הקוד האישי, מסך הבית' },
  { id: 'manual-sheet', n: 2, title: 'גיליון תורים חי', note: 'טבלה ב־Google Sheets שמתמלאת לבד' },
  { id: 'manual-refresh', n: 3, title: 'רענון אוטומטי', note: 'הגדרה חד־פעמית, כ־3 דקות' },
  { id: 'manual-tasks', n: 4, title: 'פעולות נפוצות', note: 'איפה עושים מה' },
  { id: 'manual-help', n: 5, title: 'בעיות ופתרונות', note: 'מה עושים אם משהו לא עובד' },
];

const TASKS = [
  ['לראות את התורים של היום ושל הימים הבאים', 'הלשונית היום'],
  ['לפתוח תור: פרטים, וואטסאפ ללקוח (אישור, תזכורת, הודעה), מחיקה', 'לוחצים על התור ביומן'],
  ['לפתוח שעות נוספות ביומן', 'הכפתור + באמצע הסרגל'],
  ['לראות מי מחכה לתור שיתפנה', 'הלשונית רשימה'],
  ['לשנות טיפולים, מחירים ומשך', 'הלשונית תפריט'],
  ['לשנות שעות פעילות, כתובת או טלפון', 'עוד ← פרטי העסק'],
  ['לסגור את המספרה לחופשה', 'עוד ← פרטי העסק ← מצב חופשה'],
  ['לראות את רשימת הלקוחות', 'עוד ← לקוחות'],
  ['להעלות תמונות של עבודות לאתר', 'עוד ← גלריה'],
  ['לקבל את כל התורים ביומן של הטלפון', 'עוד ← היומן בטלפון'],
  ['להוריד דוח תורים לאקסל', 'היום ← ייצוא לאקסל'],
  ['הגיליון החי: הנוסחה, הסקריפט ואיפוס הקישור', 'עוד ← גיליון חי'],
];

// Rewrites A1 with a new cache-busting parameter on every open — identical to
// the script on the "גיליון חי" page (SheetFeed.jsx).
const scriptFor = (googleUrl) =>
  [
    `const FEED = '${googleUrl}';`,
    '',
    'function refreshAppointments() {',
    '  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];',
    `  sheet.getRange('A1').setFormula('=IMPORTDATA("' + FEED + '&t=' + Date.now() + '")');`,
    '}',
    '',
    'function onOpen() {',
    '  refreshAppointments();',
    '}',
  ].join('\n');

export default function UserManual() {
  const [links, setLinks] = useState(null);
  const [linkError, setLinkError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    admin
      .sheetFeed()
      .then(setLinks)
      .catch((err) => setLinkError(err.message));
  }, []);

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <article className="px-5 pb-28 pt-5">
      <header>
        <p className="text-micro font-semibold text-haze">עזרה</p>
        <h1 className="font-display text-d3 font-semibold text-espresso">מדריך למשתמש</h1>
        <p className="he-body mt-2 text-note text-cocoa">
          כל מה שצריך לדעת כדי לנהל את התורים — בשפה פשוטה, צעד אחר צעד. המדריך תמיד כאן: <Path>עוד ← מדריך למשתמש</Path>.
        </p>
      </header>

      <nav aria-label="תוכן המדריך" className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="flex touch-manipulation items-center gap-3 rounded-plate border-2 border-sand bg-white px-3 py-2.5 text-start transition-transform duration-300 ease-lux active:scale-[0.98]"
          >
            <Num>{s.n}</Num>
            <span className="min-w-0">
              <span className="block text-note font-semibold text-espresso">{s.title}</span>
              <span className="block text-micro text-haze">{s.note}</span>
            </span>
          </button>
        ))}
      </nav>

      <Box tone="info" title="איך קוראים את ההוראות" className="mt-5">
        כשכתוב <Ui>כך</Ui> — מחפשים במסך כפתור או מילה עם הכיתוב הזה. החץ <b className="text-espresso">←</b> פירושו ״ואז״. הציורים
        הם המחשה: המסך אצלכם עשוי להיראות מעט שונה — מחפשים את אותן מילים.
      </Box>

      {/* ------------------------------------------------------------ 1 */}
      <Section {...SECTIONS[0]}>
        <p>
          מערכת הניהול היא ה״משרד״ שלכם: רואים בה את התורים, משנים מחירים ושעות, וסוגרים לחופשה. היא עובדת בדפדפן — בטלפון או
          במחשב.
        </p>
        <Address label="כתובת מערכת הניהול" note="לכם בלבד" value={`${origin}/admin`} primary />
        <Address label="כתובת האתר ללקוחות" note="אותה משתפים עם הלקוחות" value={origin} />

        <Sub tag="פעם אחת בכל מכשיר">כניסה ממכשיר חדש</Sub>
        <Steps>
          <Step n={1} title="פותחים את כתובת מערכת הניהול">בדפדפן (Chrome או Safari) של הטלפון או המחשב החדש.</Step>
          <Step n={2} title="ממלאים אימייל וסיסמה">
            ולוחצים <Ui>המשך</Ui>. הם כתובים במדריך המודפס שקיבלתם.
          </Step>
          <Step n={3} title="במסך ״בחרו קוד״ — בוחרים קוד של 6 ספרות">קוד שתזכרו — אבל לא תאריך לידה ולא 123456.</Step>
          <Step n={4} title="במסך ״עוד פעם אחת״ — מקלידים את אותו קוד שוב">זהו, המכשיר מוכן.</Step>
        </Steps>

        <Sub tag="כל יום">מהפעם השנייה והלאה</Sub>
        <p>
          פותחים את הכתובת ומקלידים <b className="text-espresso">רק את הקוד בן 6 הספרות</b> — בלי אימייל ובלי סיסמה. הקוד שייך
          רק למכשיר שבו בחרתם אותו.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Box tone="warn" title="שכחתם את הקוד?">
            במסך הקוד לוחצים <Ui>להתחבר עם אימייל וסיסמה</Ui>, נכנסים שוב, ובוחרים קוד חדש.
          </Box>
          <Box tone="warn" title="שכחתם את הסיסמה?">
            מטעמי אבטחה היא לא מוצגת במערכת. היא כתובה במדריך המודפס — ואם הוא לא אצלכם, פנו למי שהקים לכם את המערכת.
          </Box>
        </div>

        <Box tone="tip" title="טיפ: שימו את המערכת על מסך הבית — כמו אפליקציה" className="mt-3">
          <ul className="mt-1 list-disc space-y-1 ps-5">
            <li>
              <b className="text-espresso">אייפון (Safari):</b> כפתור השיתוף (ריבוע עם חץ למעלה) ← <Ui>הוספה למסך הבית</Ui> ←{' '}
              <Ui>הוספה</Ui>.
            </li>
            <li>
              <b className="text-espresso">אנדרואיד (Chrome):</b> שלוש הנקודות למעלה ← <Ui>הוספה למסך הבית</Ui> (או{' '}
              <Ui>התקנת האפליקציה</Ui>).
            </li>
          </ul>
        </Box>
      </Section>

      {/* ------------------------------------------------------------ 2 */}
      <Section {...SECTIONS[1]}>
        <p>
          ״גיליון חי״ הוא טבלה ב־<Ltr>Google Sheets</Ltr> שמתמלאת לבד בכל התורים: תאריך, שעה, לקוח, טלפון, טיפול ומחיר. לא מקלידים
          כלום — הנתונים מגיעים ישר מהמערכת. צריך רק חשבון <Ltr>Google</Ltr> (<Ltr>Gmail</Ltr>).
        </p>

        <Sub>הנוסחה האישית שלכם</Sub>
        <p>זו הנוסחה שמדביקים בגיליון. היא כוללת את הקישור הפרטי שלכם:</p>
        <Live links={links} error={linkError}>
          {(l) => <CopyBlock text={l.formula} copyLabel="העתקת הנוסחה" copiedLabel="הנוסחה הועתקה" />}
        </Live>

        <Sub>יוצרים את הגיליון</Sub>
        <Steps>
          <Step n={1} title="פותחים גיליון חדש">
            נכנסים לכתובת <Ltr>sheets.new</Ltr> — או ל־<Ltr>sheets.google.com</Ltr> ולוחצים <Ui>גיליון ריק</Ui>.
          </Step>
          <Step n={2} title="לוחצים פעם אחת על התא A1">
            התא הראשון, שבו נפגשות העמודה A והשורה 1. בגיליון בעברית הוא בפינה הימנית העליונה; באנגלית — בשמאלית.
          </Step>
          <Step n={3} title="מדביקים את הנוסחה">
            במחשב: <Key>Ctrl</Key> + <Key>V</Key>. בטלפון: לחיצה ארוכה על התא ← <Ui>הדבקה</Ui>.
          </Step>
          <Step n={4} title="לוחצים Enter">תוך כמה שניות הטבלה מתמלאת בתורים.</Step>
          <Step n={5} title="נותנים לגיליון שם">לוחצים למעלה על ״גיליון ללא שם״ וכותבים, למשל, ״תורים״.</Step>
        </Steps>
        <SheetMock />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Box tone="warn" title="בפעם הראשונה ביום — סבלנות של דקה">
            אם המערכת לא הייתה בשימוש זמן מה, היא ״מתעוררת״ תוך דקה. מופיעה שגיאה? מחכים דקה, סוגרים את הגיליון ופותחים שוב.
          </Box>
          <Box tone="info" title="לא כותבים בתוך טבלת התורים">
            היא נכתבת מחדש בכל רענון. לחישובים או הערות משלכם — פותחים לשונית חדשה בפלוס שבתחתית הגיליון.
          </Box>
        </div>
      </Section>

      {/* ------------------------------------------------------------ 3 */}
      <Section {...SECTIONS[2]}>
        <p>
          <Ltr>Google</Ltr> מרעננת את הגיליון בעצמה רק בערך פעם בשעה. ההגדרה הזו גורמת לגיליון להביא את התורים העדכניים{' '}
          <b className="text-espresso">בכל פעם שפותחים אותו</b>. עושים אותה פעם אחת — וזהו.
        </p>

        <Steps className="mt-4">
          <Step n={1} title="פותחים את עורך הקוד">
            בגיליון, בתפריט העליון: <Path>תוספים ← <Ltr>Apps Script</Ltr></Path>{' '}
            <span className="text-micro text-haze">
              (באנגלית: <Ltr>Extensions → Apps Script</Ltr>)
            </span>
            . נפתחת לשונית חדשה.
          </Step>
          <Step n={2} title="מוחקים את כל מה שכתוב במסך">
            לוחצים בתוך אזור הכתיבה, <Key>Ctrl</Key> + <Key>A</Key> (בחירת הכול) ואז <Key>Delete</Key>.
          </Step>
          <Step n={3} title="מעתיקים ומדביקים את הקוד">
            לוחצים <Ui>העתקת הסקריפט</Ui> כאן למטה, חוזרים לעורך ומדביקים עם <Key>Ctrl</Key> + <Key>V</Key>.
            <Live links={links} error={linkError}>
              {(l) => <CopyBlock text={scriptFor(l.google)} copyLabel="העתקת הסקריפט" copiedLabel="הסקריפט הועתק" multiline />}
            </Live>
          </Step>
          <Step n={4} title="שומרים">
            לוחצים על סמל הדיסקט <span className="text-micro text-haze">(״שמירת הפרויקט״)</span> — או <Key>Ctrl</Key> +{' '}
            <Key>S</Key>.
          </Step>
          <Step n={5} title="מפעילים פעם אחת">
            בודקים שליד הכפתור כתוב <Ltr mono>refreshAppointments</Ltr>, ולוחצים <Ui>▶ הפעלה</Ui>{' '}
            <span className="text-micro text-haze">(Run)</span>.
            <ToolbarMock />
          </Step>
          <Step n={6} title="מאשרים את ההרשאות של Google (רק בפעם הראשונה)">
            <ol className="mt-2 space-y-2">
              <SubStep letter="א">
                בחלון ״נדרשת הרשאה״ לוחצים <Ui>בדיקת ההרשאות</Ui> <Eng>Review permissions</Eng>.
              </SubStep>
              <SubStep letter="ב">בוחרים את חשבון ה־Google שלכם.</SubStep>
              <SubStep letter="ג">
                במסך ״Google לא אימתה את האפליקציה הזו״ — זה תקין. לוחצים <Ui>מתקדם</Ui> <Eng>Advanced</Eng>, ואז{' '}
                <Ui>מעבר אל … (לא בטוח)</Ui> <Eng>Go to … (unsafe)</Eng>.
              </SubStep>
              <SubStep letter="ד">
                לוחצים <Ui>אישור</Ui> <Eng>Allow</Eng>. אם יש תיבות סימון — <Ui>בחירת הכול</Ui> <Eng>Select all</Eng> ואז{' '}
                <Ui>המשך</Ui> <Eng>Continue</Eng>.
              </SubStep>
            </ol>
            <DialogsMock />
          </Step>
          <Step n={7} title="חוזרים ללשונית של הגיליון">
            התורים מתעדכנים. בתחתית עורך הקוד מופיע <Ltr mono>Execution completed</Ltr> — סימן שהכול עבד.
          </Step>
        </Steps>

        <Box tone="info" title="למה Google מזהירה?" className="mt-4">
          כל קוד פרטי שלא עבר בדיקה של Google מקבל את האזהרה הזו — היא לא אומרת שמשהו לא בסדר. הקוד הזה נכתב במיוחד בשבילכם, רץ
          רק בחשבון שלכם, ונוגע רק בגיליון הזה.
        </Box>
        <Box tone="done" title="זהו, סיימתם!" className="mt-3">
          מעכשיו, בכל פעם שפותחים את הגיליון, התורים העדכניים נטענים לבד. אין צורך לחזור על ההגדרה.
        </Box>
        <Box tone="tip" title="רשות: רענון גם כשהגיליון פתוח כל היום" className="mt-3">
          בעורך הקוד: סמל השעון <Ui>טריגרים</Ui> ← <Ui>הוספת טריגר</Ui> ← בוחרים <Ltr mono>refreshAppointments</Ltr> ← מקור
          האירוע: <Ui>מבוסס זמן</Ui> ← <Ui>כל 15 דקות</Ui> ← <Ui>שמירה</Ui>.
        </Box>
        <Box tone="lock" title="הקישור בקוד הוא מפתח אישי" className="mt-3">
          מי שמחזיק בו רואה את כל התורים ואת פרטי הלקוחות — לא משתפים אותו. נחשף בטעות? <Path>עוד ← גיליון חי</Path> ←{' '}
          <Ui>איפוס הקישור</Ui>. הנוסחה והסקריפט בדף הזה מתעדכנים מיד — מעתיקים אותם שוב לגיליון.
        </Box>
      </Section>

      {/* ------------------------------------------------------------ 4 */}
      <Section {...SECTIONS[3]}>
        <p>
          בתחתית המסך: <b className="text-espresso">היום</b>, <b className="text-espresso">רשימה</b>, כפתור{' '}
          <b className="text-espresso">+</b>, <b className="text-espresso">תפריט</b> ו־<b className="text-espresso">עוד</b>. כך מוצאים
          כל דבר:
        </p>
        <ul className="mt-3 divide-y-2 divide-sand overflow-hidden rounded-plate border-2 border-sand bg-white">
          {TASKS.map(([what, where]) => (
            <li key={what} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-note text-espresso">{what}</span>
              <span className="shrink-0 text-note font-semibold text-gold">{where}</span>
            </li>
          ))}
        </ul>

        <Sub>מיילים שמגיעים אליכם</Sub>
        <div className="grid gap-3 sm:grid-cols-2">
          <Box tone="info" title="תור חדש">
            כשלקוח קובע תור באתר — עם הפרטים שלו, כפתור לפתיחת מערכת הניהול, וכפתור לוואטסאפ ללקוח.
          </Box>
          <Box tone="warn" title="ביטול">
            כשלקוח מבטל בעצמו. התור מתפנה ביומן מיד, והמערכת מציעה אותו אוטומטית למי שמחכה ברשימה.
          </Box>
        </div>
      </Section>

      {/* ------------------------------------------------------------ 5 */}
      <Section {...SECTIONS[4]}>
        <div className="space-y-2">
          <Faq q="לא מצליחים להיכנס">
            בודקים שהכתובת מסתיימת ב־<Ltr>/admin</Ltr>. שכחתם את הקוד? במסך הקוד לוחצים <Ui>להתחבר עם אימייל וסיסמה</Ui>. בסיסמה
            אותיות גדולות וקטנות חשובות — מקלידים אותה לאט, לפי המדריך המודפס.
          </Faq>
          <Faq q="בגיליון מופיעה שגיאה במקום התורים">
            בדרך כלל המערכת פשוט ״ישנה״. מחכים דקה, סוגרים את הגיליון ופותחים שוב. אם זה חוזר — מעתיקים שוב את הנוסחה מסעיף 2
            ומדביקים בתא A1.
          </Faq>
          <Faq q="הגיליון לא מתעדכן">
            סוגרים ופותחים אותו. אם עדיין לא — בודקים שהקוד מסעיף 3 נשמר (שלב 4), הופעל ואושר (שלבים 5–6).
          </Faq>
          <Faq q="בחלון ההרשאות אין אפשרות ״מתקדם״">
            חשבונות Google של חברות או ארגונים חוסמים לפעמים קוד פרטי. עושים את ההגדרה עם חשבון Gmail פרטי.
          </Faq>
          <Faq q="הקישור האישי הגיע לידיים לא נכונות">
            <Path>עוד ← גיליון חי</Path> ← <Ui>איפוס הקישור</Ui>. הקישור הישן מפסיק לעבוד מיד. אחר כך מעתיקים מהדף הזה את הנוסחה
            החדשה (סעיף 2) לתא A1, ואת הסקריפט החדש (סעיף 3) לעורך הקוד.
          </Faq>
          <Faq q="לקוח ביטל — צריך לעשות משהו?">
            לא. התור מתפנה ביומן מיד, המערכת מציעה אותו אוטומטית למי שמחכה ברשימה, ומגיע אליכם מייל.
          </Faq>
          <Faq q="רוצים לצאת לחופשה">
            <Path>עוד ← פרטי העסק ← מצב חופשה</Path>. האתר מפסיק לקבל תורים ומציג ללקוחות הודעה. כשחוזרים — מכבים את המתג.
          </Faq>
        </div>
      </Section>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="mt-8 w-full touch-manipulation rounded-pill border-2 border-sand py-3 text-note font-semibold text-cocoa"
      >
        חזרה לראש המדריך
      </button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ id, n, title, children }) {
  return (
    <section id={id} className="mt-10 scroll-mt-4" aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-3 border-b-2 border-sand pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-plate bg-espresso font-display text-lead font-semibold text-cream">
          {n}
        </span>
        <div>
          <p className="text-micro font-semibold text-haze">סעיף {n}</p>
          <h2 id={`${id}-title`} className="font-display text-lead font-semibold text-espresso">
            {title}
          </h2>
        </div>
      </div>
      <div className="he-body mt-4 space-y-3 text-note text-cocoa">{children}</div>
    </section>
  );
}

function Sub({ tag, children }) {
  return (
    <h3 className="!mt-6 flex flex-wrap items-center gap-2 text-base font-semibold text-espresso">
      {children}
      {tag && <span className="rounded-pill bg-mint-soft px-2.5 py-0.5 text-micro font-semibold text-mint-deep">{tag}</span>}
    </h3>
  );
}

const Num = ({ children }) => (
  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-espresso text-micro font-semibold text-cream">
    {children}
  </span>
);

function Steps({ children, className = '' }) {
  return <ol className={`space-y-4 ${className}`}>{children}</ol>;
}

function Step({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-espresso text-micro font-semibold text-cream">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-espresso">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  );
}

const SubStep = ({ letter, children }) => (
  <li className="flex gap-2.5">
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-espresso text-micro font-semibold text-espresso">
      {letter}
    </span>
    <span className="min-w-0 flex-1">{children}</span>
  </li>
);

const TONES = {
  info: 'border-2 border-sand bg-white',
  tip: 'bg-mint-soft',
  warn: 'border-2 border-citrus/50 bg-citrus-soft',
  lock: 'bg-pomegranate-soft',
  done: 'bg-mint-soft border-2 border-mint-deep/40',
};
const TITLE_TONE = {
  info: 'text-espresso',
  tip: 'text-mint-deep',
  warn: 'text-citrus-deep',
  lock: 'text-pomegranate-deep',
  done: 'text-mint-deep',
};

function Box({ tone = 'info', title, children, className = '' }) {
  return (
    <div className={`rounded-plate px-4 py-3 ${TONES[tone]} ${className}`}>
      {title && (
        <p className={`flex items-center gap-2 text-note font-semibold ${TITLE_TONE[tone]}`}>
          {tone === 'done' && <span aria-hidden="true">✓</span>}
          {title}
        </p>
      )}
      <div className="he-body mt-1 text-note text-cocoa">{children}</div>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <details className="group rounded-plate border-2 border-sand bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-note font-semibold text-espresso [&::-webkit-details-marker]:hidden">
        {q}
        <span aria-hidden="true" className="text-lead leading-none text-gold transition-transform duration-300 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="he-body mt-2 text-note text-cocoa">{children}</div>
    </details>
  );
}

/** A button label on screen: "look for this and tap it". */
const Ui = ({ children }) => (
  <span className="mx-0.5 inline-block whitespace-nowrap rounded-pill border border-sand bg-white px-2 text-micro font-semibold leading-6 text-espresso">
    {children}
  </span>
);

const Key = ({ children }) => (
  <kbd dir="ltr" className="inline-block rounded border border-b-2 border-sand bg-white px-1.5 font-mono text-micro leading-5 text-espresso">
    {children}
  </kbd>
);

const Path = ({ children }) => <b className="font-semibold text-espresso">{children}</b>;

/** A left-to-right island in Hebrew text (names, addresses, code words) that never reorders or breaks. */
const Ltr = ({ children, mono = false }) => (
  <bdi dir="ltr" className={`whitespace-nowrap [unicode-bidi:isolate] ${mono ? 'font-mono text-[0.92em]' : ''}`}>
    {children}
  </bdi>
);

const Eng = ({ children }) => (
  <bdi dir="ltr" className="whitespace-nowrap text-micro text-haze [unicode-bidi:isolate]">
    ({children})
  </bdi>
);

function Address({ label, note, value, primary = false }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address stays visible to copy by hand */
    }
  }
  return (
    <div className={`flex items-center gap-3 rounded-plate border-2 px-4 py-3 ${primary ? 'border-gold/60 bg-white' : 'border-sand bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-micro font-semibold text-cocoa">
          {label} <span className="text-haze">· {note}</span>
        </p>
        <p dir="ltr" className="mt-0.5 break-all text-left font-mono text-note text-espresso">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 touch-manipulation rounded-pill border-2 border-sand px-3 py-1.5 text-micro font-semibold text-espresso"
      >
        {copied ? 'הועתק ✓' : 'העתקה'}
      </button>
    </div>
  );
}

/** Renders `children(links)` once the live links arrive; a skeleton or an error until then. */
function Live({ links, error, children }) {
  if (error) {
    return (
      <p role="alert" className="mt-3 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
        לא הצלחנו לטעון את הקישור האישי ({error}). אפשר להעתיק אותו גם מ־<Path>עוד ← גיליון חי</Path>.
      </p>
    );
  }
  if (!links) return <div className="mt-3 h-24 animate-breathe rounded-plate bg-shell" aria-label="טוען" />;
  return children(links);
}

function CopyBlock({ text, copyLabel, copiedLabel, multiline = false }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="mt-3">
      <pre
        dir="ltr"
        className={`overflow-x-auto rounded-plate border-2 border-sand bg-white px-3 py-3 text-left font-mono text-[12px] leading-relaxed text-espresso ${
          multiline ? 'whitespace-pre' : 'whitespace-nowrap'
        }`}
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-2 w-full touch-manipulation rounded-pill bg-espresso py-3 text-base font-semibold text-cream shadow-pop transition-transform duration-300 ease-lux active:scale-[0.98]"
      >
        {copied ? `${copiedLabel} ✓` : copyLabel}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-micro text-pomegranate-deep">
          ההעתקה לא הצליחה — אפשר לסמן את הטקסט ולהעתיק ידנית.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Illustrations of Google's screens, in Google's own light colours (literal
// values: in this theme "white" is a charcoal surface).
// ---------------------------------------------------------------------------

function Figure({ caption, children }) {
  return (
    <figure className="mt-3" aria-hidden="true">
      {children}
      <figcaption className="mt-1.5 text-center text-micro text-haze">{caption}</figcaption>
    </figure>
  );
}

function SheetMock() {
  const cols = ['A', 'B', 'C', 'D'];
  return (
    <Figure caption="המחשה: התא A1 מסומן, והנוסחה מופיעה גם בשורת הנוסחאות">
      <div className="overflow-hidden rounded-lg border border-[#dadce0] bg-[#ffffff] text-[11px] text-[#3c4043]">
        <div dir="ltr" className="flex items-center gap-2 border-b border-[#dadce0] px-2 py-1.5">
          <span className="rounded border border-[#dadce0] px-1.5 font-mono">A1</span>
          <span className="font-serif italic text-[#888888]">fx</span>
          <span className="truncate font-mono text-[#1b1b1b]">=IMPORTDATA("…")</span>
        </div>
        <div className="grid grid-cols-[1.75rem_repeat(4,1fr)]">
          <span className="border-b border-l border-[#e2e3e5] bg-[#f8f9fa]" />
          {cols.map((c) => (
            <span key={c} className="border-b border-l border-[#e2e3e5] bg-[#f8f9fa] py-0.5 text-center font-semibold">
              {c}
            </span>
          ))}
          {[1, 2, 3].map((r) => (
            <FragmentRow key={r} row={r} cols={cols} />
          ))}
        </div>
      </div>
    </Figure>
  );
}

function FragmentRow({ row, cols }) {
  return (
    <>
      <span className="border-b border-l border-[#e2e3e5] bg-[#f8f9fa] py-1 text-center font-semibold">{row}</span>
      {cols.map((c) => (
        <span
          key={c}
          className={`h-6 border-b border-l border-[#e2e3e5] ${row === 1 && c === 'A' ? 'bg-[#e8f0fe] outline outline-2 outline-offset-[-2px] outline-[#1a73e8]' : ''}`}
        />
      ))}
    </>
  );
}

function ToolbarMock() {
  const hl = 'rounded bg-[#e8f0fe] px-1.5 py-0.5 font-semibold text-[#1a56c8] outline outline-[1.5px] outline-[#1a73e8]';
  return (
    <Figure caption="המחשה: סמל הדיסקט (שמירה), כפתור ההפעלה, ובתחתית ההודעה שהכול עבד">
      <div className="overflow-hidden rounded-lg border border-[#dadce0] bg-[#ffffff] text-[11px] text-[#3c4043]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dadce0] px-2 py-2">
          <span className={hl}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline">
              <path d="M5 3h11l3 3v15H5z" />
              <path d="M8 3v6h8V3M8 21v-7h8v7" />
            </svg>
          </span>
          <span className={hl}>▶ הפעלה</span>
          <span className="px-1">ניפוי באגים</span>
          <span dir="ltr" className="rounded border border-[#dadce0] px-1.5 font-mono">
            refreshAppointments ▾
          </span>
        </div>
        <div dir="ltr" className="bg-[#f8f9fa] px-2 py-1 text-left font-mono text-[10px] text-[#188038]">
          Execution completed
        </div>
      </div>
    </Figure>
  );
}

function DialogsMock() {
  const card = 'rounded-lg border border-[#d3d7dd] bg-[#ffffff] p-3 text-[11px] leading-snug text-[#3c4043]';
  const title = 'mb-1 text-[12px] font-bold text-[#202124]';
  const pri = 'rounded bg-[#1a73e8] px-2 py-0.5 font-semibold text-[#ffffff] outline outline-2 outline-offset-2 outline-[#b0853f]';
  const sec = 'rounded border border-[#dadce0] px-2 py-0.5 font-semibold text-[#1a73e8]';
  const link = 'font-semibold text-[#1a73e8] underline outline outline-2 outline-offset-2 outline-[#b0853f]';
  return (
    <Figure caption="המחשה: שלושת חלונות האישור לפי הסדר — המסומן בזהב הוא מה שלוחצים">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className={card}>
          <p className={title}>א · נדרשת הרשאה</p>
          <p>הפרויקט צריך את ההרשאה שלכם כדי לגשת לנתונים.</p>
          <p className="mt-2 flex gap-2">
            <span className={pri}>בדיקת ההרשאות</span>
            <span className={sec}>ביטול</span>
          </p>
        </div>
        <div className={card}>
          <p className={title}>ג · Google לא אימתה את האפליקציה</p>
          <p className="mt-2 space-y-2">
            <span className={`${link} block w-fit`}>מתקדם</span>
            <span className={`${link} block w-fit`}>מעבר אל … (לא בטוח)</span>
          </p>
        </div>
        <div className={card}>
          <p className={title}>ד · בקשת גישה לחשבון</p>
          <p>כדי לכתוב את הנוסחה בגיליון שלכם.</p>
          <p className="mt-2 flex gap-2">
            <span className={pri}>אישור</span>
            <span className={sec}>ביטול</span>
          </p>
        </div>
      </div>
    </Figure>
  );
}
