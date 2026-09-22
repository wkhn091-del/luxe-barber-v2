import { useEffect, useRef, useState } from 'react';

/**
 * ===========================================================================
 *  A trash icon that asks once
 * ===========================================================================
 *
 * First tap: the icon becomes "למחוק?". Second tap: gone. No second tap within
 * four seconds and it quietly resets. One-tap delete is how real bookings
 * vanish by accident; a modal per row is how clearing twenty demo rows takes
 * ten minutes. This is the middle.
 *
 * On success the parent removes the row, which unmounts this — so there is no
 * "done" state here.
 */
export default function DeleteButton({ onDelete, label, confirmText = 'למחוק?' }) {
  const [stage, setStage] = useState('idle'); // idle | confirm | busy | failed
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const later = (next, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage(next), ms);
  };

  const arm = (e) => {
    e.stopPropagation();
    setStage('confirm');
    later('idle', 4000);
  };

  const confirm = async (e) => {
    e.stopPropagation();
    clearTimeout(timer.current);
    setStage('busy');
    try {
      await onDelete();
    } catch {
      setStage('failed');
      later('idle', 3000);
    }
  };

  const cancel = (e) => {
    e.stopPropagation();
    clearTimeout(timer.current);
    setStage('idle');
  };

  if (stage === 'confirm' || stage === 'busy') {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={confirm}
          disabled={stage === 'busy'}
          className="touch-manipulation rounded-pill bg-citrus px-3.5 py-2 text-micro font-semibold text-white shadow-pop transition-transform duration-200 active:scale-95 disabled:opacity-60"
        >
          {stage === 'busy' ? 'מוחק…' : confirmText}
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="לא למחוק"
          className="grid h-9 w-9 touch-manipulation place-items-center rounded-pill text-haze hover:text-cocoa"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={arm}
      aria-label={label}
      title={stage === 'failed' ? 'המחיקה נכשלה — נסו שוב' : label}
      className={[
        'grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-pill transition-colors duration-300',
        stage === 'failed' ? 'bg-citrus-soft text-citrus-deep' : 'text-haze hover:bg-shell hover:text-citrus-deep',
      ].join(' ')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
