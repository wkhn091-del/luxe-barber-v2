import { useCallback, useEffect, useRef } from 'react';
import { overlayOpened } from '../lib/overlay.js';

/**
 * ===========================================================================
 *  SHEET — the one modal primitive in the product
 * ===========================================================================
 *
 * On a phone a bottom sheet is the correct modal: it enters from the thumb, it
 * is dismissed by the same gesture that opened it, and it never covers the
 * thing you tapped to open it.
 *
 * Four things a hand-rolled sheet usually gets wrong, all handled here:
 *
 *   1. FOCUS. Opening moves focus in, Tab is trapped inside, and closing puts
 *      focus back exactly where it was — otherwise a keyboard or screen-reader
 *      user is dumped at the top of the document.
 *   2. BACKGROUND SCROLL. Locked while open. `overscroll-contain` stops a flick
 *      inside the sheet chaining through to the page behind it.
 *   3. THE DRAG. Handled with direct style writes inside rAF, so a 120Hz drag
 *      does not queue 120 React renders a second.
 *   4. RUBBER-BANDING. Downward drags only, and only when the sheet's own
 *      content is already scrolled to the top — so dragging to dismiss never
 *      fights scrolling the sheet.
 */
export default function Sheet({ open, onClose, title, children, footer, maxWidth = 'max-w-md' }) {
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const drag = useRef({ active: false, startY: 0, offset: 0, raf: 0 });

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const panel = panelRef.current;

    // A frame's grace so the entrance animation is not interrupted by a
    // scroll-into-view.
    const id = requestAnimationFrame(() => {
      const first = panel?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (first ?? panel)?.focus?.();
    });

    return () => {
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Freeze the 3D scene behind us while open (see lib/overlay.js).
  useEffect(() => (open ? overlayOpened() : undefined), [open]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return undefined;

      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return undefined;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrap at both ends so Tab can never escape into the frozen page behind.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return undefined;
    },
    [onClose]
  );

  const paint = useCallback(() => {
    drag.current.raf = 0;
    const panel = panelRef.current;
    if (panel) panel.style.transform = `translate3d(0, ${drag.current.offset}px, 0)`;
  }, []);

  /*
    DRAG TO DISMISS — from the handle and the title bar only.

    The old version armed the drag on ANY touch inside the sheet and captured
    the pointer on touch-down. Pointer capture retargets the finger's release
    to the sheet itself, so on many phones the tap never became a click on
    the button underneath: time slots, day chips and the booking button
    "often didn't respond". Now the content area is never touched by this
    code — its taps and its scrolling are the browser's alone — and a drag
    starts only from the grab zone, and only after the finger has clearly
    moved down (8px), so even a tap on the handle stays a tap.
  */
  const onGrabDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { ...drag.current, armed: true, active: false, startY: e.clientY, offset: 0 };
  };

  const onGrabMove = (e) => {
    const d = drag.current;
    if (!d.armed) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (dy < 8) return;
      d.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (panelRef.current) panelRef.current.style.transition = 'none';
    }
    // Downward only. Upward would peel the sheet off the top of the screen.
    d.offset = Math.max(0, dy);
    if (!d.raf) d.raf = requestAnimationFrame(paint);
  };

  const onGrabUp = (e) => {
    const d = drag.current;
    d.armed = false;
    if (!d.active) return;
    d.active = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
      panel.style.transform = 'translate3d(0, 0, 0)';
    }
    // 96px is a deliberate flick; below that it reads as a mis-touch and the
    // sheet springs back.
    if (d.offset > 96) onClose();
    d.offset = 0;
  };

  if (!open) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label="סגירה"
        onClick={onClose}
        className="absolute inset-0 animate-veil-in cursor-default bg-onyx/75 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'relative w-full animate-sheet-up bg-cream outline-none',
          'rounded-t-sheet shadow-lift sm:rounded-sheet',
          // With pinned actions the panel is a column: header, scrolling body,
          // footer. Capped at the viewport so it can never be taller than the
          // phone — the body scrolls instead.
          footer ? 'flex max-h-[92dvh] flex-col' : '',
          maxWidth,
        ].join(' ')}
      >
        {/* The grab zone: handle + title. touch-none so the browser leaves the
            drag to us here — and ONLY here. */}
        <div
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          className="cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-10 rounded-pill bg-sand" />
          </div>

          {title && (
            <div className="border-b border-sand px-5 pb-4 pt-2">
              <h2 className="font-display text-lead font-semibold text-espresso">{title}</h2>
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          className={
            footer
              ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5'
              : 'max-h-[78dvh] overflow-y-auto overscroll-contain px-5 pb-safe pt-5'
          }
        >
          {children}
        </div>

        {/* Pinned actions. OUTSIDE the scrolling body rather than position:
            sticky inside it — so they can never scroll away, and never depend
            on how a browser treats sticky inside a padded scroll box. */}
        {footer && <div className="shrink-0 border-t border-sand bg-cream px-5 pb-safe pt-4">{footer}</div>}
      </div>
    </div>
  );
}
