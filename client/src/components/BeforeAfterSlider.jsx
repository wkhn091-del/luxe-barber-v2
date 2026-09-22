import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ===========================================================================
 *  לפני / אחרי — drag to reveal
 * ===========================================================================
 *
 * The whole component is one number: how far across the divider sits. Four
 * decisions make it feel like dragging a physical edge rather than moving a
 * slider widget:
 *
 *   1. Pointer Events + setPointerCapture. One code path for mouse, touch and
 *      stylus, and the drag keeps tracking after the finger leaves the image —
 *      which is what people actually do when they fling it to an edge.
 *   2. The position is written straight to a CSS custom property inside rAF,
 *      never through React state. A 120Hz drag would otherwise queue 120
 *      renders a second.
 *   3. clip-path: inset() on the top layer. Compositor-only, so the reveal runs
 *      on the GPU with no layout or paint per frame.
 *   4. touch-action: pan-y. Vertical page scrolling still works with a finger
 *      on the photo; only horizontal movement comes to us. Setting `none` here
 *      is the usual mistake — it traps the page on mobile.
 *
 * RTL NOTE: the geometry is screen-space, not reading-space. "Before" stays on
 * the LEFT of the handle and "after" on the right, because the slider reveals
 * along the axis your thumb moves, not along the axis you read. Only the
 * labels are Hebrew.
 */
export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  caption,
  initial = 52,
  hint = true,
  priority = false,
}) {
  const frameRef = useRef(null);
  const rafRef = useRef(0);
  const pendingRef = useRef(initial);
  const positionRef = useRef(initial);

  // State exists only for things that must re-render: the accessible value and
  // which label is legible. The visual position lives in the CSS variable.
  const [announced, setAnnounced] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const commit = useCallback(() => {
    rafRef.current = 0;
    const next = pendingRef.current;
    positionRef.current = next;
    frameRef.current?.style.setProperty('--pos', `${next}%`);
    // Round hard so we do not re-render on sub-pixel movement.
    setAnnounced((prev) => (Math.abs(prev - next) > 1 ? Math.round(next) : prev));
  }, []);

  const schedule = useCallback(
    (value) => {
      pendingRef.current = Math.min(100, Math.max(0, value));
      if (!rafRef.current) rafRef.current = requestAnimationFrame(commit);
    },
    [commit]
  );

  const positionFromEvent = useCallback((clientX) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width) return null;
    return ((clientX - rect.left) / rect.width) * 100;
  }, []);

  const onPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    frameRef.current?.setPointerCapture?.(e.pointerId);
    setDragging(true);
    const next = positionFromEvent(e.clientX);
    if (next !== null) schedule(next);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const next = positionFromEvent(e.clientX);
    if (next !== null) schedule(next);
  };

  const endDrag = (e) => {
    if (!dragging) return;
    frameRef.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  // The handle is a real slider to assistive tech, so arrow keys must work.
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: -step, ArrowRight: step, ArrowDown: -step, ArrowUp: step, Home: -100, End: 100 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const base = e.key === 'Home' || e.key === 'End' ? 50 : positionRef.current;
    schedule(base + moves[e.key]);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <figure className="m-0">
      <div
        ref={frameRef}
        style={{ '--pos': `${initial}%` }}
        className={[
          'group relative aspect-[4/5] w-full select-none overflow-hidden rounded-glass',
          'border-2 border-sand bg-shell sm:aspect-[3/2]',
          'touch-pan-y',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        ].join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* After — the base layer, fully painted underneath. */}
        <img
          src={afterUrl}
          alt={caption ? `אחרי: ${caption}` : 'אחרי התספורת'}
          draggable={false}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={[
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-600 ease-lux',
            loaded ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />

        {/* Before — clipped from the right by the divider. Compositor-only. */}
        <div className="absolute inset-0" style={{ clipPath: 'inset(0 calc(100% - var(--pos)) 0 0)' }}>
          <img
            src={beforeUrl}
            alt={caption ? `לפני: ${caption}` : 'לפני התספורת'}
            draggable={false}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        {/* Labels sit in opposite corners and fade as the divider passes them.
            Positioned with left/right on purpose — they mark the two halves of
            the IMAGE, which do not mirror. */}
        <span
          className="pointer-events-none absolute left-4 top-4 rounded-pill bg-white/90 px-3 py-1 text-micro font-semibold text-cocoa transition-opacity duration-400 ease-lux"
          style={{ opacity: announced < 18 ? 0 : 1 }}
        >
          לפני
        </span>
        <span
          className="pointer-events-none absolute right-4 top-4 rounded-pill bg-mint px-3 py-1 text-micro font-semibold text-white transition-opacity duration-400 ease-lux"
          style={{ opacity: announced > 82 ? 0 : 1 }}
        >
          אחרי
        </span>

        {/* The divider */}
        <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white" style={{ left: 'var(--pos)' }} />

        {/* The grip. 44px for a thumb. */}
        <button
          type="button"
          role="slider"
          aria-label="לגרור כדי לראות את ההבדל"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={announced}
          aria-valuetext={`${announced} אחוז נחשף`}
          onKeyDown={onKeyDown}
          className={[
            'absolute top-1/2 z-20 flex h-11 w-11 items-center justify-center',
            'rounded-pill border-2 border-white bg-espresso shadow-lift',
            hint && !dragging ? 'animate-nudge' : '',
          ].join(' ')}
          style={{ left: 'var(--pos)', transform: 'translate3d(-50%, -50%, 0)' }}
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
            <path
              d="M5.5 1.5 1.5 6l4 4.5M10.5 1.5 14.5 6l-4 4.5"
              stroke="#0B1110"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {caption && <figcaption className="mt-3 text-note text-cocoa">{caption}</figcaption>}
    </figure>
  );
}
