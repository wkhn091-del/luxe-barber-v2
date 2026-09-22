import { useSyncExternalStore } from 'react';

/**
 * How many sheets are open right now.
 *
 * The hero's 3D scene reads this and STOPS RENDERING while anything covers it.
 * An open sheet puts a frosted backdrop (backdrop-filter: blur) over the
 * canvas, and a blur over a canvas that redraws every frame is one of the most
 * expensive things a phone browser can be asked to do: the whole page drops
 * frames, the sheet's own slide-up stutters, and taps inside it feel dead.
 * Frozen, the blur is computed once and the sheet runs at full speed.
 */
let open = 0;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

/** Call when an overlay opens; call the returned function when it closes. */
export function overlayOpened() {
  open += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open = Math.max(0, open - 1);
    emit();
  };
}

export function useOverlayOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open > 0,
    () => false
  );
}
