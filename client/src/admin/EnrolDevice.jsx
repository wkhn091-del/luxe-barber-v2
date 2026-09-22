import { useCallback, useState } from 'react';
import PinPad from './PinPad.jsx';
import { admin, adminAuth } from '../lib/adminApi.js';

/**
 * ===========================================================================
 *  הגדרה ראשונה במכשיר חדש
 * ===========================================================================
 *
 * Email and password once, then choose a code. From then on this phone opens
 * with six digits.
 *
 * The second screen is where the security model actually gets explained to the
 * barber — one sentence, in their language, at the moment it is relevant.
 * People choose better codes when they understand what the code is FOR, and
 * worse ones when a policy paragraph shouts at them.
 */
export default function EnrolDevice({ onReady }) {
  const [stage, setStage] = useState('credentials'); // credentials | choose | confirm
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await admin.login(email.trim(), password);
      adminAuth.setToken(token);
      setStage('choose');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const choose = useCallback((pin) => {
    setFirstPin(pin);
    setError(null);
    setStage('confirm');
  }, []);

  const confirm = useCallback(
    async (pin) => {
      if (pin !== firstPin) {
        setError('הקודים לא תואמים. מתחילים מחדש.');
        setStage('choose');
        setFirstPin('');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        // A label the barber will recognise later in the device list. Rough
        // platform sniffing is fine — it is a human-readable hint, not a
        // security boundary.
        const label = /iPhone|iPad/.test(navigator.userAgent)
          ? 'אייפון'
          : /Android/.test(navigator.userAgent)
            ? 'אנדרואיד'
            : 'דפדפן';

        const device = await admin.enrolDevice(pin, label);
        adminAuth.setDevice(device);
        onReady();
      } catch (err) {
        // The server rejects weak codes with a plain-language reason; send the
        // barber back to pick another rather than explaining it ourselves.
        setError(err.message);
        setStage('choose');
        setFirstPin('');
        setBusy(false);
      }
    },
    [firstPin, onReady]
  );

  if (stage === 'credentials') {
    return (
      <Shell>
        <h1 className="font-display text-d2 font-semibold text-espresso">לוקסי</h1>
        <p className="mt-2 text-note text-cocoa">הגדרה חד־פעמית למכשיר הזה. אחר כך — רק קוד.</p>

        <div className="mt-9 space-y-4">
          {/* dir="ltr" with right alignment: an email address is LTR text, so
              typing it into an RTL field puts the caret on the wrong side. */}
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            style={{ textAlign: 'right' }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@luxebarber.com"
            className="w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze focus:border-espresso"
          />
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            style={{ textAlign: 'right' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="סיסמה"
            className="w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze focus:border-espresso"
          />

          {error && (
            <p role="alert" className="rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={signIn}
            disabled={busy || !email || !password}
            className="w-full rounded-pill bg-espresso py-4 text-base font-semibold text-cream shadow-pop transition-transform duration-300 ease-lux active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'בודקים…' : 'המשך'}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-d3 font-semibold text-espresso">
        {stage === 'choose' ? 'בחרו קוד' : 'עוד פעם אחת'}
      </h1>
      <p className="he-body mt-2 max-w-xs text-note text-cocoa">
        {stage === 'choose'
          ? 'שש ספרות לפתיחת המכשיר הזה. הקוד עובד רק כאן, במכשיר הזה — אף אחד לא יכול להשתמש בו ממקום אחר.'
          : 'הקלידו שוב כדי לוודא.'}
      </p>

      <div className="mt-8 flex justify-center">
        <PinPad
          key={stage} // a fresh pad per stage, so digits never carry over
          onComplete={stage === 'choose' ? choose : confirm}
          busy={busy}
          error={error}
          label={stage === 'choose' ? 'קוד חדש' : 'אישור הקוד'}
          hint={stage === 'choose' ? 'לא תאריך לידה, ולא 123456.' : undefined}
        />
      </div>
    </Shell>
  );
}

const Shell = ({ children }) => (
  <main dir="rtl" className="grain flex min-h-[100dvh] flex-col items-center justify-center bg-cream px-6">
    <div className="w-full max-w-sm">{children}</div>
  </main>
);
