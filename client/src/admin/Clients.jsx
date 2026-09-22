import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { Num } from '../lib/bidi.jsx';
import { displayPhone } from '../lib/phone.js';
import DeleteButton from './DeleteButton.jsx';

/**
 * ===========================================================================
 *  לקוחות
 * ===========================================================================
 *
 * Everyone who has booked or joined the waitlist, most recent first, with one
 * search box that takes a name, a phone number in any format, or an email.
 *
 * Deleting a client removes EVERYTHING of theirs — appointments, waitlist
 * places, message history — in one transaction. That is what clearing demo
 * data needs, and it is a real person's right to be forgotten too. It sends
 * nothing: no cancellation goes out for the appointments it removes.
 */
export default function Clients({ barber }) {
  const timeZone = barber?.timezone ?? 'Asia/Jerusalem';
  const [q, setQ] = useState('');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Typing is debounced; the first load is not.
    const id = setTimeout(
      () => {
        admin
          .clients(q.trim())
          .then((data) => {
            if (!alive) return;
            setClients(data.clients);
            setError(null);
          })
          .catch((err) => alive && setError(err.message))
          .finally(() => alive && setLoading(false));
      },
      q ? 250 : 0
    );
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q]);

  const lastVisit = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric', timeZone });

  async function remove(client) {
    const res = await admin.deleteClient(client.id);
    setClients((list) => list.filter((c) => c.id !== client.id));
    setNotice(
      res.appointments
        ? `נמחקו הפרטים של ${client.name} ו־${res.appointments} תורים.`
        : `נמחקו הפרטים של ${client.name}.`
    );
  }

  return (
    <div className="px-5 pb-28 pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-d3 font-semibold text-espresso">לקוחות</h1>
        {!loading && (
          <span className="text-note text-cocoa">
            <Num>{clients.length}</Num>
          </span>
        )}
      </div>
      <p className="he-body mt-2 text-note text-cocoa">
        מחיקה מסירה גם את כל התורים והרישומים של הלקוח — בלי לשלוח לו הודעה.
      </p>

      <label className="mt-5 block">
        <span className="sr-only">חיפוש לקוח</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או מייל"
          className="w-full rounded-pill border-2 border-sand bg-white px-5 py-3 text-base text-espresso placeholder:text-haze focus:border-espresso"
        />
      </label>

      {notice && (
        <p role="status" className="mt-4 rounded-plate bg-mint-soft px-4 py-3 text-note text-mint-deep">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}
      {loading && clients.length === 0 && <div className="mt-6 h-40 animate-breathe rounded-plate bg-shell" />}

      {clients.length > 0 && (
        <ul className="mt-5 divide-y divide-sand overflow-hidden rounded-plate border-2 border-sand bg-white">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3 pe-2 ps-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-espresso">
                  {c.name}
                  {c.vip && (
                    <span className="ms-2 rounded-pill bg-grape-soft px-2 py-0.5 text-micro font-semibold text-grape-deep">
                      VIP
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-note text-cocoa">
                  <Num>{displayPhone(c.phone)}</Num>
                  {c.email && (
                    <>
                      {' · '}
                      <bdi dir="ltr">{c.email}</bdi>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-micro text-haze">
                  <Num>{c.appointmentCount}</Num> תורים
                  {c.waitlistCount > 0 && (
                    <>
                      {' · '}
                      <Num>{c.waitlistCount}</Num> ברשימת ההמתנה
                    </>
                  )}
                  {c.lastVisitAt && <> · אחרון {lastVisit.format(new Date(c.lastVisitAt))}</>}
                </p>
              </div>
              <DeleteButton
                label={`מחיקת ${c.name}`}
                confirmText={c.appointmentCount ? 'למחוק הכול?' : 'למחוק?'}
                onDelete={() => remove(c)}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && clients.length === 0 && !error && (
        <p className="mt-8 text-center text-note text-haze">{q ? 'לא נמצאו לקוחות.' : 'עוד אין לקוחות.'}</p>
      )}
    </div>
  );
}
