import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { displayPhone } from '../lib/phone.js';

/**
 * The shell of the privacy policy and the accessibility statement. The text
 * is filled from the shop's live details (name, address, phone, email from
 * the admin's פרטי העסק), so it never shows a placeholder and never goes stale.
 */
export default function LegalPage({ title, updated, children }) {
  const [shop, setShop] = useState(null);

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    api
      .shop()
      .then(setShop)
      .catch(() => setShop({}));
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div dir="rtl" className="min-h-screen bg-cream text-espresso">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6 sm:px-8">
        <Link to="/" className="font-display text-lead font-semibold text-espresso">
          {shop?.name || '\u00a0'}
        </Link>
        <Link to="/" className="rounded-pill border-2 border-sand px-4 py-2 text-note font-semibold text-cocoa transition-colors duration-300 hover:text-espresso">
          לדף הבית
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
        <h1 className="font-display text-d2 font-semibold leading-tight text-espresso">{title}</h1>
        <p className="mt-2 text-note text-haze">עודכן לאחרונה: {updated}</p>
        {shop ? (
          <div className="he-body mt-8 space-y-7 text-base leading-relaxed text-cocoa [&_h2]:mb-2 [&_h2]:text-lead [&_h2]:font-semibold [&_h2]:text-espresso [&_li]:ms-5 [&_li]:list-disc">
            {children(shop)}
          </div>
        ) : (
          <div className="mt-8 h-96 animate-breathe rounded-plate bg-shell" />
        )}
      </main>
    </div>
  );
}

/**
 * The shop's phone and email inside a Hebrew sentence, as tappable links.
 *
 * Each sits in its own left-to-right island (dir="ltr", unicode-bidi: isolate)
 * in the paragraph's own font, so "050-396-7230" can never reorder or change
 * typeface mid-sentence. Neither may wrap: a hyphen is a line-break
 * opportunity, which is exactly how "050-396-" ended one line and "7230" began
 * the next. An email too long for a very narrow screen is shortened with "…"
 * instead of pushing the page sideways — the link (and its tooltip) still
 * carries the full address, and screen readers read all of it.
 */
export function ContactLinks({ shop }) {
  const phone = shop.phone ? displayPhone(shop.phone) : null;
  const link = 'underline decoration-sand underline-offset-4 transition-colors duration-300 hover:text-espresso';
  return (
    <>
      {phone && (
        <>
          {' '}טלפון{' '}
          <a href={`tel:${shop.phone}`} className={link}>
            <bdi dir="ltr" className="whitespace-nowrap [unicode-bidi:isolate]">
              {phone}
            </bdi>
          </a>
        </>
      )}
      {shop.email && (
        <>
          {phone ? ' · ' : ' '}מייל{' '}
          <a href={`mailto:${shop.email}`} title={shop.email} dir="ltr" className={`${link} inline-block max-w-full truncate align-bottom`}>
            <bdi dir="ltr" className="whitespace-nowrap [unicode-bidi:isolate]">
              {shop.email}
            </bdi>
          </a>
        </>
      )}
    </>
  );
}
