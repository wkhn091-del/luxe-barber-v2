import { useEffect, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { Num, formatClock, formatDay } from '../lib/bidi.jsx';
import { useTick, secondsUntil, clockLabel } from '../hooks/useTick.js';
import { offerText, helloText, prefixed } from '../lib/whatsapp.js';
import { WhatsAppChip } from './WhatsApp.jsx';

/**
 * ===========================================================================
 *  רשימת ההמתנה
 * ===========================================================================
 *
 * The live queue, in the order the engine will actually work through it:
 * priority first, then first-come. The position numbers are the barber's
 * answer to "איפה אני ברשימה?" asked across the counter.
 *
 * Anyone currently holding an offer is pulled to the top with their countdown
 * running, because that is the only row where anything is happening. The offer
 * went out by email; the WhatsApp button resends the same confirm link by
 * hand — and it turns solid when the client has no email, because then it is
 * the ONLY way they will hear about it before the clock runs out.
 */
const PREF_HE = {
  ANY: null,
  MORNING: 'בקרים',
  AFTERNOON: 'צהריים',
  EVENING: 'ערבים',
};

export default function Queue({ barber }) {
  const timeZone = barber?.timezone ?? 'Asia/Jerusalem';
  const shop = { name: barber?.name, address: barber?.addressLine };
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  useTick(1000);

  useEffect(() => {
    admin
      .waitlist()
      .then((d) => setEntries(d.entries))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const live = entries.filter((e) => e.liveOffer);
  const waiting = entries.filter((e) => !e.liveOffer);

  return (
    <div className="px-5 pb-28 pt-7">
      <h1 className="font-display text-d3 font-semibold text-espresso">רשימת המתנה</h1>
      <p className="he-body mt-2 text-note text-cocoa">
        <Num>{entries.length}</Num> ממתינים. אנחנו מציעים תורים אחד־אחד, לפי הסדר הזה.
      </p>

      {loading && <div className="mt-6 h-36 animate-breathe rounded-plate bg-shell" />}

      {live.length > 0 && (
        <div className="mt-6 space-y-3">
          {live.map((entry) => {
            const seconds = secondsUntil(entry.liveOffer.expiresAt);
            const critical = seconds <= 60;
            const noEmail = entry.client.email === null;
            return (
              <div
                key={entry.id}
                className={[
                  'rounded-plate border-2 px-4 py-4',
                  critical ? 'border-pomegranate bg-pomegranate-soft' : 'border-citrus bg-citrus-soft',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-espresso">{entry.client.name}</p>
                    <p className="mt-0.5 text-note text-cocoa">
                      הוצע <Num>{formatClock(entry.liveOffer.slotStartAt, timeZone)}</Num> · אדם{' '}
                      <Num>{entry.liveOffer.attemptNumber}</Num> על המשבצת
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-lead font-semibold ${
                      critical ? 'text-pomegranate-deep' : 'text-citrus-deep'
                    }`}
                  >
                    <Num>{clockLabel(seconds)}</Num>
                  </span>
                </div>

                {seconds > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <WhatsAppChip
                      phone={entry.client.phone}
                      solid={noEmail}
                      label="לשלוח את ההצעה בוואטסאפ"
                      text={offerText({
                        client: entry.client,
                        service: entry.service,
                        slotStartAt: entry.liveOffer.slotStartAt,
                        expiresAt: entry.liveOffer.expiresAt,
                        token: entry.liveOffer.token,
                        shop,
                        tz: timeZone,
                      })}
                    />
                    {noEmail && (
                      <span className="text-micro font-semibold text-cocoa">אין מייל — ההצעה לא יצאה אוטומטית</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        {waiting.map((entry, i) => {
          const pref = PREF_HE[entry.timePref];
          return (
            <div key={entry.id} className="flex items-center gap-4 border-t border-sand py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-shell text-note font-semibold text-cocoa">
                <Num>{i + live.length + 1}</Num>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-espresso">
                  {entry.client.name}
                  {entry.client.vip && (
                    <span className="ms-2 rounded-pill bg-grape-soft px-2 py-0.5 text-micro font-semibold text-grape-deep">
                      VIP
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-note text-cocoa">
                  {entry.service.name}
                  {pref && ` · ${pref}`}
                  {entry.missedOffers > 0 && (
                    <>
                      {' · '}
                      <Num>{entry.missedOffers}</Num> החמצות
                    </>
                  )}
                </p>
              </div>
              <WhatsAppChip
                iconOnly
                phone={entry.client.phone}
                label={`וואטסאפ ${prefixed('ל', entry.client.name)}`}
                text={helloText({
                  client: entry.client,
                  shop,
                  context: `לגבי רשימת ההמתנה · ${entry.service.name}`,
                })}
              />
              <a
                href={`tel:${entry.client.phone}`}
                className="shrink-0 rounded-pill border-2 border-sand bg-white px-4 py-1.5 text-micro font-semibold text-espresso"
              >
                חיוג
              </a>
            </div>
          );
        })}
        {waiting.length > 0 && <div className="border-t border-sand" />}
      </div>

      {!loading && entries.length === 0 && (
        <div className="mt-8 rounded-glass border-2 border-dashed border-sand px-5 py-10 text-center">
          <p className="font-display text-d3 font-semibold text-espresso">אין אף אחד ברשימה</p>
          <p className="he-body mt-3 text-note text-cocoa">
            הרשימה מתמלאת כשהיומן מתמלא. נכון להיום — {formatDay(new Date().toISOString(), timeZone)} — יש מקום.
          </p>
        </div>
      )}
    </div>
  );
}
