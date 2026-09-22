import { useEffect, useRef, useState } from 'react';

/**
 * A countdown that survives a locked phone.
 *
 * Two things go wrong in naive implementations, and both bite exactly the
 * people this screen is for — someone who opened an SMS, got distracted, and
 * came back:
 *
 *   1. Decrementing a counter every second drifts, because setInterval is not
 *      a clock. Here the deadline is an absolute timestamp and each tick
 *      recomputes from Date.now(), so accumulated error is always zero.
 *   2. Background tabs and locked screens throttle timers to once a minute or
 *      stop them entirely. Coming back to a stale number on a screen whose
 *      whole job is urgency is worse than useless, so we recompute on
 *      visibilitychange and on focus.
 *
 * The deadline itself comes from the server's `secondsRemaining`, never from
 * the device clock — a phone set five minutes fast must not show five minutes
 * less.
 *
 * @param {number|null} secondsRemaining  server value at the moment of fetch
 * @param {() => void} [onExpire]
 */
export function useCountdown(secondsRemaining, onExpire) {
  // Anchor: wall-clock instant the offer dies, derived once from the server's
  // relative value plus local elapsed time.
  const deadlineRef = useRef(null);
  const firedRef = useRef(false);
  const [remaining, setRemaining] = useState(secondsRemaining ?? 0);

  useEffect(() => {
    if (secondsRemaining == null) return;
    deadlineRef.current = Date.now() + secondsRemaining * 1000;
    firedRef.current = false;
    setRemaining(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining == null) return undefined;

    const tick = () => {
      if (!deadlineRef.current) return;
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    };

    // 250ms, not 1000: the displayed second changes within a quarter-second of
    // the real one, so the number never looks stuck.
    const id = setInterval(tick, 250);
    const onWake = () => tick();

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    tick();

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [secondsRemaining, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {
    remaining,
    minutes,
    seconds,
    label: `${minutes}:${String(seconds).padStart(2, '0')}`,
    expired: remaining === 0,
    /** Under a minute: the screen changes colour and starts to breathe. */
    critical: remaining > 0 && remaining <= 60,
    urgent: remaining > 0 && remaining <= 120,
  };
}
