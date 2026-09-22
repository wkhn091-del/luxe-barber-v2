import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { isEmail } from '../lib/email.js';
import { displayPhone, wazeFor } from '../lib/phone.js';
import { TimesText } from '../lib/bidi.jsx';
import { rulesFromWeek, summarizeWeek, weekFromRules, weekProblems } from '../lib/weeklyHours.js';
import Switch from './Switch.jsx';
import WeekEditor from './WeekEditor.jsx';

/**
 * ===========================================================================
 *  פרטי העסק
 * ===========================================================================
 *
 * Everything the public site knows about the shop, in one place:
 *
 *   - מצב חופשה — closes the site to bookings. It saves the moment it is
 *     switched: a "close the shop" switch that waits for a Save button is how a
 *     barber ends up believing he is closed when he is not.
 *   - the contact details the site, emails and help page read live;
 *   - שעות פעילות — the weekly shifts. They are not display text: every
 *     bookable slot is generated from them, and the hours the site shows are
 *     generated from them too.
 *
 * The checks mirror the server's (settings.schema.js, schedule.service.js), so
 * a mistake is explained in Hebrew next to its field, not as a failed save.
 */
const FIELDS = [
  { key: 'name', label: 'שם העסק', placeholder: 'לוקסי', hint: 'מופיע במיילים ובאתר.', autoComplete: 'organization' },
  { key: 'phone', label: 'טלפון', placeholder: '03-555-0123', ltr: true, type: 'tel', inputMode: 'tel', hint: 'הכפתור ״התקשרו״ באתר ובמיילים.' },
  { key: 'addressLine', label: 'כתובת', placeholder: 'רחוב דיזנגוף 99, תל אביב', hint: 'מוצגת באתר ובאישורי התור.' },
  {
    key: 'wazeUrl',
    label: 'קישור Waze',
    placeholder: 'https://waze.com/ul/…',
    ltr: true,
    type: 'url',
    inputMode: 'url',
    hint: 'ב־Waze: מחפשים את המספרה ← שיתוף ← העתקת קישור. ריק — הניווט יהיה לפי הכתובת.',
  },
  { key: 'instagramUrl', label: 'אינסטגרם', placeholder: 'https://instagram.com/…', ltr: true, type: 'url', inputMode: 'url' },
  { key: 'email', label: 'מייל העסק', placeholder: 'shop@gmail.com', ltr: true, type: 'email', inputMode: 'email', hint: 'לכאן מגיעות תשובות של לקוחות למיילים מהמערכת.' },
];

function onHost(value, host) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && (url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function problemsOf(form) {
  const p = {};
  if (form.name.trim().length < 2) p.name = 'שם העסק קצר מדי';
  if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 9) p.phone = 'מספר הטלפון לא נראה תקין';
  if (form.wazeUrl.trim() && !onHost(form.wazeUrl, 'waze.com')) p.wazeUrl = 'קישור Waze צריך להתחיל ב־https://waze.com';
  if (form.instagramUrl.trim() && !onHost(form.instagramUrl, 'instagram.com')) p.instagramUrl = 'קישור אינסטגרם צריך להתחיל ב־https://instagram.com';
  if (form.email.trim() && !isEmail(form.email)) p.email = 'כתובת המייל לא תקינה';
  if (form.vacationMessage.trim().length > 200) p.vacationMessage = 'ההודעה ארוכה מדי (עד 200 תווים)';
  return p;
}

const toForm = (s) => ({
  name: s?.name ?? '',
  phone: s?.phone ? displayPhone(s.phone) : '',
  addressLine: s?.addressLine ?? '',
  wazeUrl: s?.wazeUrl ?? '',
  instagramUrl: s?.instagramUrl ?? '',
  email: s?.email ?? '',
  vacationMessage: s?.vacationMessage ?? '',
});

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [week, setWeek] = useState(null);
  const [savedWeek, setSavedWeek] = useState(null);
  const [vacation, setVacation] = useState(false);
  const [vacationBusy, setVacationBusy] = useState(false);
  const [touched, setTouched] = useState({});
  const [state, setState] = useState('idle'); // idle | saving | saved
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([admin.settings(), admin.workingHours()])
      .then(([{ settings }, { rules }]) => {
        const f = toForm(settings);
        const w = weekFromRules(rules);
        setForm(f);
        setSaved(f);
        setWeek(w);
        setSavedWeek(JSON.stringify(w));
        setVacation(Boolean(settings?.vacationMode));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (!form || !week) {
    return (
      <div className="px-5 pb-28 pt-5">
        <h1 className="font-display text-d3 font-semibold text-espresso">פרטי העסק</h1>
        {error ? (
          <p role="alert" className="mt-6 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
            {error}
          </p>
        ) : (
          <div className="mt-6 h-72 animate-breathe rounded-plate bg-shell" />
        )}
      </div>
    );
  }

  const problems = problemsOf(form);
  const hourProblems = weekProblems(week);
  const detailsDirty = JSON.stringify(form) !== JSON.stringify(saved);
  const weekDirty = JSON.stringify(week) !== savedWeek;
  const blocked = Object.keys(problems).length > 0 || Object.keys(hourProblems).length > 0;
  const waze = wazeFor({ wazeUrl: form.wazeUrl.trim() && !problems.wazeUrl ? form.wazeUrl.trim() : '', addressLine: form.addressLine });

  async function toggleVacation() {
    const next = !vacation;
    setVacation(next); // instant feedback; reverted if the save fails
    setVacationBusy(true);
    setError(null);
    try {
      await admin.updateSettings({ vacationMode: next });
    } catch (err) {
      setVacation(!next);
      setError(err.message);
    } finally {
      setVacationBusy(false);
    }
  }

  async function save() {
    setTouched(Object.fromEntries([...FIELDS.map((f) => [f.key, true]), ['vacationMessage', true]]));
    if (blocked) return;
    setState('saving');
    setError(null);
    try {
      if (detailsDirty) {
        const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
        const { settings } = await admin.updateSettings(body);
        const f = toForm(settings);
        setForm(f);
        setSaved(f);
      }
      if (weekDirty) {
        const { rules } = await admin.setWorkingHours(rulesFromWeek(week));
        const w = weekFromRules(rules);
        setWeek(w);
        setSavedWeek(JSON.stringify(w));
      }
      setState('saved');
    } catch (err) {
      setState('idle');
      setError(err.message);
    }
  }

  const edit = (key, value) => {
    setForm({ ...form, [key]: value });
    setState('idle');
  };

  return (
    <div className="px-5 pb-28 pt-5">
      <h1 className="font-display text-d3 font-semibold text-espresso">פרטי העסק</h1>
      <p className="he-body mt-2 text-note text-cocoa">מה שנשמר כאן מופיע מיד באתר ובמיילים.</p>

      {/* --- מצב חופשה: saves on the switch ------------------------------- */}
      <section
        className={[
          'mt-6 rounded-plate border-2 p-4 transition-colors duration-300',
          vacation ? 'border-citrus bg-citrus-soft' : 'border-sand bg-white',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-base font-semibold text-espresso">מצב חופשה</span>
            <span className="mt-0.5 block text-note text-cocoa">
              {vacation ? 'האתר סגור לקביעת תורים עכשיו. תורים קיימים לא בוטלו.' : 'סוגר את האתר לקביעת תורים, עד שמכבים.'}
            </span>
          </span>
          <Switch on={vacation} onToggle={toggleVacation} label="מצב חופשה" disabled={vacationBusy} />
        </div>
        {vacation && (
          <label className="mt-4 block">
            <span className="text-note font-semibold text-espresso">הודעה ללקוחות (לא חובה)</span>
            <input
              value={form.vacationMessage}
              onChange={(e) => edit('vacationMessage', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, vacationMessage: true }))}
              placeholder="למשל: חוזרים ב־1 באוקטובר"
              className="mt-2 w-full rounded-plate border-2 border-sand bg-white px-4 py-3 text-base text-espresso placeholder:text-haze focus:border-espresso"
            />
            <span className="mt-1.5 block text-micro text-haze">
              {touched.vacationMessage && problems.vacationMessage
                ? problems.vacationMessage
                : 'מוצגת באתר מתחת ל״המספרה סגורה כרגע, נחזור בקרוב״. נשמרת בכפתור ״שמירה״.'}
            </span>
          </label>
        )}
      </section>

      {/* --- contact details ---------------------------------------------- */}
      <div className="mt-6 space-y-5">
        {FIELDS.map((f) => {
          const problem = touched[f.key] && problems[f.key];
          return (
            <label key={f.key} className="block">
              <span className="text-note font-semibold text-espresso">{f.label}</span>
              <input
                type={f.type ?? 'text'}
                inputMode={f.inputMode}
                autoComplete={f.autoComplete ?? 'off'}
                dir={f.ltr ? 'ltr' : undefined}
                style={f.ltr ? { textAlign: 'right' } : undefined}
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => edit(f.key, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                aria-invalid={problem ? 'true' : undefined}
                className={[
                  'mt-2 w-full rounded-plate border-2 bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze',
                  problem ? 'border-pomegranate' : 'border-sand focus:border-espresso',
                ].join(' ')}
              />
              {problem ? (
                <span className="mt-1.5 block text-micro text-pomegranate-deep">{problem}</span>
              ) : (
                f.hint && <span className="mt-1.5 block text-micro text-haze">{f.hint}</span>
              )}
            </label>
          );
        })}
      </div>

      {waze && (
        <a
          href={waze}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 text-note font-semibold text-pomegranate-deep underline decoration-sand underline-offset-4"
        >
          בדיקת הניווט ב־Waze
        </a>
      )}

      {/* --- שעות פעילות: the weekly shifts -------------------------------- */}
      <section className="mt-10">
        <h2 className="text-lead font-semibold text-espresso">שעות פעילות</h2>
        <p className="he-body mt-1 text-note text-cocoa">
          היומן באתר מציע תורים רק בתוך השעות האלה — וכל תור צריך להיכנס בשלמותו לפני סוף המשמרת.
        </p>
        <div className="mt-4">
          <WeekEditor
            week={week}
            onChange={(w) => {
              setWeek(w);
              setState('idle');
            }}
          />
        </div>
        <div className="mt-3 rounded-plate border-2 border-dashed border-sand px-4 py-3">
          <span className="block text-micro font-semibold text-haze">כך השעות יוצגו באתר</span>
          <span className="mt-1.5 block text-note text-cocoa">
            {summarizeWeek(week)
              .split('\n')
              .map((line, i) => (
                <TimesText key={i} text={line} className="block" />
              ))}
          </span>
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-5 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}

      {/* Sticky above the tab bar: the page is long on a phone; Save is not. */}
      <div className="sticky bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-10 -mx-5 mt-6 border-t border-sand bg-cream/95 px-5 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={save}
          disabled={(!detailsDirty && !weekDirty) || state === 'saving' || blocked}
          className="w-full touch-manipulation rounded-pill bg-espresso py-3.5 text-base font-semibold text-cream shadow-pop transition-[transform,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-40"
        >
          {state === 'saving' ? 'שומרים…' : state === 'saved' && !detailsDirty && !weekDirty ? 'נשמר ✓ — כבר באתר' : 'שמירה'}
        </button>
      </div>
    </div>
  );
}
