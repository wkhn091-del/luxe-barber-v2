import LegalPage, { ContactLinks } from '../components/LegalPage.jsx';

/**
 * הצהרת נגישות — states what was actually built for accessibility and what
 * is still limited, and names who to contact. It says the site was built to
 * AIM for IS 5568 (WCAG 2.0 AA), not that it is certified: only an audit can
 * say that. Have it reviewed before launch.
 */
export default function Accessibility() {
  return (
    <LegalPage title="הצהרת נגישות" updated="ספטמבר 2026">
      {(shop) => (
        <>
          <section>
            <p>
              {shop.name || 'המספרה'} רואה חשיבות בכך שכל אחד ואחת יוכלו לקבוע תור באתר בקלות. האתר נבנה במטרה לעמוד בדרישות תקן
              ישראלי 5568 לנגישות תכנים באינטרנט, ברמה AA (המבוסס על הנחיות WCAG 2.0).
            </p>
          </section>
          <section>
            <h2>מה נעשה באתר</h2>
            <ul>
              <li>ניווט מלא במקלדת, עם סימון ברור של הרכיב שבפוקוס.</li>
              <li>תוויות לקוראי מסך לכפתורים, לשדות ולשעות, וכותרות במבנה עקבי.</li>
              <li>ניגודיות צבעים גבוהה, וטקסט שאפשר להגדיל בהגדרות הדפדפן.</li>
              <li>כיבוד הגדרת ״הפחתת תנועה״ של המכשיר — האנימציות נרגעות או נעצרות.</li>
              <li>טפסים עם הודעות שגיאה ברורות, ליד השדה שבו הן מופיעות.</li>
              <li>תמיכה מלאה בעברית ובכיוון כתיבה מימין לשמאל, כולל שעות ותאריכים שנקראים נכון.</li>
            </ul>
          </section>
          <section>
            <h2>מגבלות ידועות</h2>
            <ul>
              <li>ההנפשה התלת־ממדית ברקע היא עיצובית בלבד ומוסתרת מקוראי מסך.</li>
              <li>הצעה מרשימת ההמתנה שמורה לזמן מוגבל. אם צריך יותר זמן — התקשרו, ונשמור את התור.</li>
              <li>קישורים לשירותים חיצוניים, כמו Waze ואינסטגרם, אינם בשליטתנו.</li>
            </ul>
          </section>
          <section>
            <h2>נגישות המספרה עצמה</h2>
            <p>לפרטים על הנגישות הפיזית של המספרה — גישה, חניה ושירותים — צרו איתנו קשר ונשמח לעזור ולהיערך מראש.</p>
          </section>
          <section>
            <h2>נתקלתם בבעיה?</h2>
            <p>
              אם משהו באתר לא נגיש לכם, נשמח לשמוע ולתקן. פנייה לרכז הנגישות של {shop.name || 'המספרה'}:
              <ContactLinks shop={shop} />
              . אפשר גם לקבוע תור בטלפון, בלי האתר.
            </p>
          </section>
        </>
      )}
    </LegalPage>
  );
}
