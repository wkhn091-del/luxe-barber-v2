import { useEffect, useReducer } from 'react';

/**
 * Re-render on a clock.
 *
 * Used by the admin timeline, where a dozen HELD rows each show their own live
 * countdown. The naive version is one interval per row; this is ONE interval
 * for the whole screen, with each row computing its own remaining time from its
 * own deadline during the render it triggers.
 *
 * Pauses while the tab is hidden — a backgrounded phone in a barber's apron
 * pocket should not be waking up once a second.
 */
export function useTick(ms = 1000) {
  const [, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    let id = null;

    const start = () => {
      if (id) return;
      id = setInterval(bump, ms);
    };
    const stop = () => {
      clearInterval(id);
      id = null;
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        bump(); // catch up immediately, then resume
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms]);
}

/** mm:ss from a deadline, floored at zero. */
export function secondsUntil(iso) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

export function clockLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
