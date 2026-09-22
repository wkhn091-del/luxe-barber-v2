import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * ===========================================================================
 *  404 — an old link, a typo, a path that never existed
 * ===========================================================================
 *
 * The host answers every unknown path with the app (that is what lets deep
 * links like /o/:token work), so this page is a "soft" 404: the status is 200.
 * It therefore tells search engines not to index it, for as long as it is on
 * screen.
 */
export default function NotFound() {
  const { pathname } = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'הדף לא נמצא · לוקסי';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-onyx px-5 py-12">
      {/* A warm pool of light behind the number — the hero's back wall, again. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 45% at 50% 36%, rgba(255,201,138,0.11), rgba(255,201,138,0) 70%)' }}
      />

      <div className="relative w-full max-w-md text-center">
        <img src="/favicon.svg" alt="" width="56" height="56" className="mx-auto h-14 w-14" />

        <p
          aria-hidden="true"
          className="figures mt-6 bg-gradient-to-b from-gold-lit via-gold to-[#8E6A26] bg-clip-text text-[7rem] font-semibold leading-none tracking-tight text-transparent sm:text-[9rem]"
        >
          404
        </p>

        <h1 className="mt-4 font-display text-d3 font-semibold text-ivory">הדף הזה לא קיים</h1>
        <p className="he-body mt-3 text-base text-champagne">
          אולי הקישור ישן, ואולי נפלה אות בכתובת. הכיסא, בכל מקרה, עדיין כאן.
        </p>
        <p className="mt-2 text-micro text-pewter">
          לא מצאנו את{' '}
          <bdi dir="ltr" className="break-all font-mono">
            {pathname}
          </bdi>
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="rounded-pill bg-gold px-7 py-3.5 text-base font-semibold text-onyx shadow-pop transition-[background-color,transform] duration-300 ease-lux hover:bg-gold-lit active:scale-[0.98]"
          >
            לדף הבית
          </Link>
          {/* A full navigation, so the browser scrolls to the menu on arrival. */}
          <a
            href="/#menu"
            className="rounded-pill border border-line px-7 py-3.5 text-base font-semibold text-ivory transition-colors duration-300 hover:border-gold/60"
          >
            קביעת תור
          </a>
        </div>

        <Link
          to="/help"
          className="mt-6 inline-block text-note text-champagne underline decoration-gold/40 underline-offset-4 transition-colors duration-300 hover:text-ivory"
        >
          שאלות נפוצות
        </Link>
      </div>
    </main>
  );
}
