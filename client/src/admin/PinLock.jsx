import { useCallback, useState } from 'react';
import PinPad from './PinPad.jsx';
import { admin, adminAuth } from '../lib/adminApi.js';

/**
 * מסך הפתיחה — what the barber sees every morning: six digits, nothing else.
 *
 * No email field, no "remember me", no logo lockup. The device is already
 * trusted; this is an unlock, not a sign-in, and it should feel like one.
 */
export default function PinLock({ onUnlocked }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (pin) => {
      setBusy(true);
      setError(null);
      try {
        const { token } = await admin.unlock(pin);
        adminAuth.setToken(token);
        navigator.vibrate?.([8, 40, 12]);
        onUnlocked();
      } catch (err) {
        // The server already says the useful thing — how many attempts remain,
        // or how long the wait is, in Hebrew. Passing it through beats
        // inventing our own copy that could contradict it.
        setError(err.message);
        setBusy(false);
      }
    },
    [onUnlocked]
  );

  return (
    <main dir="rtl" className="grain flex min-h-[100dvh] flex-col items-center justify-center bg-cream px-6">
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ring-white">
        <span
          className="h-full w-full"
          style={{
            background:
              'repeating-linear-gradient(135deg, #C0352F 0 5px, #EFE6D6 5px 10px, #2A5DB5 10px 15px, #EFE6D6 15px 20px)',
          }}
        />
      </span>
      <h1 className="mt-4 font-display text-d3 font-semibold text-espresso">לוקסי</h1>

      <div className="mt-8 flex justify-center">
        <PinPad
          onComplete={submit}
          busy={busy}
          error={error}
          label={adminAuth.device?.label ?? 'הזינו קוד'}
        />
      </div>

      <button
        type="button"
        onClick={() => adminAuth.forget()}
        className="mt-10 text-note text-haze underline-offset-4 transition-colors duration-300 hover:text-cocoa hover:underline"
      >
        להתחבר עם אימייל וסיסמה
      </button>
    </main>
  );
}
