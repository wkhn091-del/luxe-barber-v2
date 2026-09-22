import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { Num, Price, themeFor } from '../lib/bidi.jsx';
import ServiceEditor from './ServiceEditor.jsx';
import DeleteButton from './DeleteButton.jsx';

/**
 * ===========================================================================
 *  תפריט הטיפולים
 * ===========================================================================
 *
 * The same colour-per-service system the public menu uses, so the barber edits
 * the thing they can see on their own website. A service's accent is its
 * identity in both places.
 *
 * Deliberately NOT a table. Four to eight services is the real range for a
 * one-chair shop, and a row the width of a thumb that opens an editor beats a
 * grid of tiny inline fields every time on a phone.
 */
export default function Services({ barber }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // a service object, or 'new'
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = () =>
    admin
      .services()
      .then((d) => setServices(d.services))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  /**
   * Reordering with two arrows rather than drag-and-drop.
   *
   * Dragging a list item on a touch screen fights the page scroll, needs a
   * long-press to disambiguate, and is unusable one-handed. Two 44px arrows are
   * boring and they work — and with six services nobody is moving anything far.
   *
   * RTL NOTE: the arrows point UP and DOWN, not left and right, so there is
   * nothing to mirror. Vertical order is the same in every language.
   */
  /**
   * Deletes a service that was never booked. One with history is RETIRED
   * instead — hidden from the menu, kept for the records — and the notice
   * says so, rather than pretending it vanished.
   */
  async function remove(service) {
    await admin.deleteService(service.id);
    const data = await admin.services();
    setServices(data.services);
    const kept = data.services.some((s) => s.id === service.id);
    setNotice(kept ? `״${service.name}״ הוסתר מהתפריט — יש לו תורים בהיסטוריה, אז הוא נשמר לרישומים.` : null);
  }

  async function move(index, direction) {
    const next = [...services];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    setServices(next); // optimistic; order is cosmetic, so a failed write is cheap
    navigator.vibrate?.(8);
    await admin.reorderServices(next.map((s) => s.id)).catch(() => load());
  }

  return (
    <div className="px-5 pb-28 pt-7">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-d3 font-semibold text-espresso">תפריט הטיפולים</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-pill bg-espresso px-5 py-2 text-note font-semibold text-cream shadow-pop transition-transform duration-300 ease-lux active:scale-[0.97]"
        >
          הוספה
        </button>
      </div>

      <p className="he-body mt-2 text-note text-cocoa">
        האתר קורא מכאן בזמן אמת. שינוי משך — והשעות הפנויות מחר זזות איתו.
      </p>

      {notice && (
        <p role="status" className="mt-4 rounded-plate bg-mint-soft px-4 py-3 text-note text-mint-deep">
          {notice}
        </p>
      )}

      {loading && <div className="mt-6 h-44 animate-breathe rounded-plate bg-shell" />}

      {error && (
        <p role="alert" className="mt-6 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {services.map((service, i) => {
          const theme = themeFor(i);
          return (
            <div
              key={service.id}
              className={[
                'flex items-stretch gap-3 overflow-hidden rounded-plate border-2 border-sand bg-white',
                service.active ? '' : 'opacity-55',
              ].join(' ')}
            >
              <span className={`w-1.5 shrink-0 ${theme.bar}`} />

              {/* Order controls. Real labels rather than bare glyphs, so screen
                  readers announce which service is moving. */}
              <div className="flex shrink-0 flex-col justify-center py-2">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`להעלות את ${service.name}`}
                  className="grid h-7 w-8 place-items-center text-haze transition-colors duration-200 hover:text-cocoa disabled:opacity-25"
                >
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
                    <path d="M1 7l5-5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === services.length - 1}
                  aria-label={`להוריד את ${service.name}`}
                  className="grid h-7 w-8 place-items-center text-haze transition-colors duration-200 hover:text-cocoa disabled:opacity-25"
                >
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
                    <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setEditing(service)}
                className="flex flex-1 items-start justify-between gap-4 py-4 pe-4 text-start"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-espresso">
                    {service.name}
                    {!service.active && (
                      <span className="ms-2 rounded-pill bg-shell px-2 py-0.5 text-micro font-semibold text-haze">
                        לא בתפריט
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-note text-cocoa">
                    <Num>{service.durationMin}</Num> דק׳
                    {service.bookingCount > 0 && (
                      <>
                        {' · נקבע '}
                        <Num>{service.bookingCount}</Num> פעמים
                      </>
                    )}
                  </span>
                </span>
                <Price cents={service.priceCents} className={`shrink-0 text-lead font-semibold ${theme.text}`} />
              </button>
              <div className="flex items-center pe-2">
                <DeleteButton label={`מחיקת ${service.name}`} onDelete={() => remove(service)} />
              </div>
            </div>
          );
        })}
      </div>

      {!loading && services.length === 0 && (
        <div className="mt-8 rounded-glass border-2 border-dashed border-sand px-5 py-10 text-center">
          <p className="font-display text-d3 font-semibold text-espresso">התפריט ריק</p>
          <p className="he-body mt-3 text-note text-cocoa">
            הוסיפו טיפול ראשון והאתר עולה לאוויר.
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-6 rounded-pill bg-pomegranate px-7 py-3 text-note font-semibold text-white shadow-pop"
          >
            להוסיף טיפול
          </button>
        </div>
      )}

      <ServiceEditor
        service={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        barber={barber}
        index={editing && editing !== 'new' ? services.findIndex((s) => s.id === editing.id) : services.length}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
