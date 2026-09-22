import { useCallback, useEffect, useRef, useState } from 'react';
import { Num } from '../lib/bidi.jsx';

/**
 * ===========================================================================
 *  מקלדת הקוד
 * ===========================================================================
 *
 * A custom keypad rather than an `<input>`. Three practical reasons:
 *
 *   - `type="number"` brings spinners on desktop and the wrong keyboard on
 *     some Androids; `type="tel"` gets digits but also autocorrect chrome.
 *   - The OS keyboard covers the bottom half of the screen, which is exactly
 *     where a keypad belongs.
 *   - Buttons can be 64px tall. A barber types this with clippers in the other
 *     hand, standing up, sometimes with wet fingers.
 *
 * It submits itself on the last digit. There is no confirm button, because
 * knowing the code IS the confirmation — asking twice is a tap the barber pays
 * every single morning.
 *
 * RTL NOTE: the keypad grid is NOT mirrored. Numeric keypads run 1-2-3 left to
 * right in Israel exactly as everywhere else — phone dialers, ATMs and
 * calculators are all LTR here. Mirroring it would be a textbook case of
 * applying RTL where the convention is universal, and it would make the barber
 * mistype their own code. Only the labels and the layout around it flip.
 */
export default function PinPad({
  length = 6,
  onComplete,
  busy = false,
  error = null,
  disabled = false,
  label = 'הזינו קוד',
  hint,
}) {
  const [digits, setDigits] = useState('');
  const [shaking, setShaking] = useState(false);
  const submitted = useRef(false);

  const buzz = (pattern) => navigator.vibrate?.(pattern);

  const push = useCallback(
    (digit) => {
      if (disabled || busy) return;
      setDigits((current) => {
        if (current.length >= length) return current;
        buzz(8);
        return current + digit;
      });
    },
    [disabled, busy, length]
  );

  const back = useCallback(() => {
    if (disabled || busy) return;
    setDigits((current) => {
      if (!current) return current;
      buzz(8);
      return current.slice(0, -1);
    });
  }, [disabled, busy]);

  // Fire once the last digit lands.
  useEffect(() => {
    if (digits.length !== length || submitted.current) return;
    submitted.current = true;
    onComplete(digits);
  }, [digits, length, onComplete]);

  // A new error means the attempt finished and failed: shake, buzz, clear.
  useEffect(() => {
    if (!error) return undefined;
    submitted.current = false;
    setShaking(true);
    buzz([14, 70, 14]);
    const clear = setTimeout(() => {
      setDigits('');
      setShaking(false);
    }, 420);
    return () => clearTimeout(clear);
  }, [error]);

  // Hardware keyboards exist — the laptop in the back room counts.
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [push, back]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'back'];

  return (
    <div className="w-full max-w-xs">
      <p className="text-center text-note font-semibold text-cocoa">{label}</p>

      {/* Dots. Filled ones go solid — the only feedback that a tap landed, so
          they change instantly rather than on a transition. */}
      <div
        className={`mt-6 flex justify-center gap-3 ${shaking ? 'animate-shake' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={`הוזנו ${digits.length} מתוך ${length} ספרות`}
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={[
              'h-3 w-3 rounded-full transition-colors duration-200',
              i < digits.length
                ? error
                  ? 'bg-pomegranate'
                  : 'bg-espresso'
                : 'border-2 border-sand bg-transparent',
            ].join(' ')}
          />
        ))}
      </div>

      <div className="mt-4 min-h-[2.75rem] px-2 text-center">
        {error ? (
          <p role="alert" className="text-note text-pomegranate-deep">
            {error}
          </p>
        ) : (
          hint && <p className="text-note text-haze">{hint}</p>
        )}
      </div>

      {/* dir="ltr" on the grid only — see the RTL note at the top of the file. */}
      <div dir="ltr" className="mt-1 grid grid-cols-3 gap-2.5">
        {keys.map((key, i) => {
          if (key === null) return <span key={i} />;

          if (key === 'back') {
            return (
              <button
                key={i}
                type="button"
                onClick={back}
                disabled={disabled || busy || !digits.length}
                aria-label="מחיקה"
                className="grid h-16 place-items-center rounded-plate bg-shell text-cocoa transition-[background-color,transform] duration-200 active:scale-[0.96] active:bg-sand disabled:opacity-35"
              >
                <svg width="24" height="20" viewBox="0 0 24 20" fill="none" aria-hidden="true">
                  <path d="M8 2h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8L1 10l7-8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 7.5 17 12.5M17 7.5 12 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            );
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => push(key)}
              disabled={disabled || busy}
              className="h-16 rounded-plate bg-white font-display text-2xl font-semibold text-espresso shadow-pop transition-[background-color,transform] duration-200 active:scale-[0.96] active:bg-shell disabled:opacity-40"
            >
              <Num>{key}</Num>
            </button>
          );
        })}
      </div>

      {busy && (
        <div className="mt-6 flex justify-center gap-1.5" role="status" aria-label="בודקים">
          {['bg-pomegranate', 'bg-citrus', 'bg-azure'].map((c) => (
            <span key={c} className={`h-2 w-2 animate-breathe rounded-full ${c}`} />
          ))}
        </div>
      )}
    </div>
  );
}
