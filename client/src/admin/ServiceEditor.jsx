import { useEffect, useRef, useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import { admin } from '../lib/adminApi.js';
import { Num, Price, themeFor } from '../lib/bidi.jsx';

/**
 * ===========================================================================
 *  עריכת טיפול
 * ===========================================================================
 *
 * Three fields, and one number that makes the whole screen worth building.
 *
 * As the barber changes the duration, the sheet asks the server how many of
 * that treatment actually fit in their working week — counted per contiguous
 * opening, because a 45-minute cut cannot run across a lunch break. Watching
 * "24 בשבוע" become "20 בשבוע" while your thumb is still on the stepper is the
 * difference between SETTING a duration and UNDERSTANDING one.
 *
 * It also warns when a duration falls off the slot grid. With a 15-minute grid
 * and a 5-minute buffer, a 50-minute treatment consumes 55 and strands 5
 * minutes after every single cut — roughly forty minutes of dead time a day
 * that nothing can be booked into, and invisible until someone points at it.
 */
const DURATIONS = [15, 20, 30, 45, 60, 75, 90];
// The dropdown: every 5 minutes from 5 to 4 hours. (The server accepts 5–480;
// anything outside this list — a legacy 7-minute or 5-hour service — is added
// to it, so the current value can always be shown.)
const DURATION_STEPS = Array.from({ length: 48 }, (_, i) => (i + 1) * 5);

export default function ServiceEditor({ service, open, barber, index = 0, onClose, onSaved }) {
  const isNew = !service;
  const theme = themeFor(index < 0 ? 0 : index);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(45);
  const [price, setPrice] = useState('180');
  const [active, setActive] = useState(true);

  const [capacity, setCapacity] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retired, setRetired] = useState(null);

  // Reset whenever the sheet opens on a different service.
  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setDescription(service?.description ?? '');
    setDuration(service?.durationMin ?? 45);
    setPrice(service ? String(Math.round(service.priceCents / 100)) : '180');
    setActive(service?.active ?? true);
    setError(null);
    setConfirmDelete(false);
    setRetired(null);
  }, [open, service]);

  // Debounced capacity lookup, so flicking through the dropdown or the chips
  // doesn't fire a request per value on the way.
  const debounce = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      admin.capacity(duration).then(setCapacity).catch(() => setCapacity(null));
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [duration, open]);

  const priceCents = Math.round(Number(price || 0) * 100);
  const valid = name.trim().length >= 2 && duration >= 5 && Number.isFinite(priceCents);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        durationMin: duration,
        priceCents,
        currency: 'ILS',
      };
      if (isNew) await admin.createService(body);
      else await admin.updateService(service.id, { ...body, active });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await admin.deleteService(service.id);
      // A service with history is RETIRED, not deleted — the barber needs to
      // know which happened, because "retired" means it is still in the books.
      if (result.retired) setRetired(result);
      else onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (retired) {
    return (
      <Sheet open onClose={onSaved} title={null}>
        <div className="pb-6 pt-2 text-center">
          <h2 className="font-display text-d3 font-semibold text-espresso">הורד מהתפריט</h2>
          <p className="he-body mt-4 text-note text-cocoa">
            ל־{service.name} יש <Num>{retired.appointments}</Num> תורים ביומן, אז הוא נשמר
            להיסטוריה במקום להימחק. אף אחד לא יכול לקבוע אותו יותר.
          </p>
          <button
            type="button"
            onClick={onSaved}
            className="mt-8 w-full rounded-pill border-2 border-sand bg-white py-3.5 text-base font-semibold text-espresso"
          >
            סגור
          </button>
        </div>
      </Sheet>
    );
  }

  const fieldClass =
    'mt-2 w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze transition-colors duration-300 focus:border-espresso';

  // Pinned to the bottom of the sheet (see Sheet's `footer`): whatever the
  // screen size and however far the form is scrolled, Save and Cancel stay
  // in reach. The error sits here too, so a failed save is always seen.
  const footer = (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
          className={`flex-[2] touch-manipulation rounded-pill ${theme.btn} py-3.5 text-base font-semibold text-white shadow-pop transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-40`}
        >
          {busy ? 'שומרים…' : isNew ? 'להוסיף לתפריט' : 'לשמור שינויים'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 touch-manipulation rounded-pill border-2 border-sand bg-white py-3.5 text-base font-semibold text-cocoa transition-colors duration-300 ease-lux hover:text-espresso disabled:opacity-40"
        >
          ביטול
        </button>
      </div>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'טיפול חדש' : service?.name} footer={footer}>
      <div className="space-y-6 pb-4">
        <label className="block">
          <span className="text-note font-semibold text-espresso">שם הטיפול</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="תספורת גבר"
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="text-note font-semibold text-espresso">תיאור</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="ייעוץ, תספורת, שמפו וסידור"
            className={fieldClass}
          />
          <span className="mt-2 block text-micro text-haze">מופיע מתחת לשם בדף ההזמנות.</span>
        </label>

        {/* --- Price ----------------------------------------------------- */}
        <label className="block">
          <span className="text-note font-semibold text-espresso">מחיר</span>
          <div className="relative mt-2">
            {/* The shekel sign sits at the END of the field — the side the
                number finishes on in an RTL layout. */}
            <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-base text-cocoa">
              ₪
            </span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              style={{ textAlign: 'right' }}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
              placeholder="180"
              className="w-full rounded-plate border-2 border-sand bg-white py-3.5 pe-10 ps-4 text-base text-espresso placeholder:text-haze focus:border-espresso"
            />
          </div>
          <span className="mt-2 block text-micro text-haze">מזומן במקום. שום דבר לא נגבה אונליין.</span>
        </label>

        {/* --- Duration -------------------------------------------------- */}
        <div>
          {/* The value IS the control: a real dropdown on the label's row, so the
              duration is editable at a glance, without scrolling to the chips. */}
          <label className="flex items-center justify-between gap-4">
            <span className="text-note font-semibold text-espresso">משך הטיפול</span>
            <span className="relative">
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                aria-label="משך הטיפול בדקות"
                className="touch-manipulation appearance-none rounded-plate border-2 border-sand bg-white py-2.5 pe-10 ps-4 text-base font-semibold text-espresso transition-colors duration-300 focus:border-espresso"
              >
                {(DURATION_STEPS.includes(duration) ? DURATION_STEPS : [...DURATION_STEPS, duration].sort((a, b) => a - b)).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d} דקות
                    </option>
                  )
                )}
              </select>
              <svg
                width="12"
                height="8"
                viewBox="0 0 12 8"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-cocoa"
              >
                <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                aria-pressed={duration === d}
                className={[
                  'rounded-pill border-2 px-4 py-2 text-note font-semibold transition-all duration-300 ease-lux active:scale-[0.97]',
                  duration === d
                    ? `${theme.border} ${theme.soft} ${theme.text}`
                    : 'border-sand bg-white text-cocoa hover:border-cocoa/40',
                ].join(' ')}
              >
                <Num>{d}</Num>
              </button>
            ))}
          </div>


          {/* The number that makes this screen worth building. */}
          {capacity && (
            <div className={`mt-4 rounded-plate ${theme.soft} px-4 py-4`}>
              <p className="text-base text-espresso">
                <span className={`font-display text-2xl font-semibold ${theme.text}`}>
                  <Num>{capacity.perWeek}</Num>
                </span>{' '}
                <span className="text-note text-cocoa">נכנסים לכם בשבוע, לפי שעות העבודה הנוכחיות</span>
              </p>

              {capacity.wastePerBlock > 0 && (
                <p className="he-body mt-3 text-note text-cocoa">
                  המשך הזה לא מסתדר עם משבצות של <Num>{barber?.slotGranularityMin ?? 15}</Num> דקות —
                  נשארות <Num>{capacity.wastePerBlock}</Num> דקות מתות אחרי כל תספורת שאי אפשר
                  לקבוע בהן כלום.
                </p>
              )}
            </div>
          )}
        </div>

        {/* --- On the menu ----------------------------------------------- */}
        {!isNew && (
          <button
            type="button"
            onClick={() => setActive((a) => !a)}
            className="flex w-full items-center justify-between gap-4 rounded-plate border-2 border-sand bg-white px-4 py-4 text-start"
          >
            <span>
              <span className="block text-base font-semibold text-espresso">מופיע בדף ההזמנות</span>
              <span className="mt-0.5 block text-note text-cocoa">
                {active ? 'לקוחות יכולים לקבוע עכשיו.' : 'מוסתר מהלקוחות.'}
              </span>
            </span>
            {/* The knob travels toward the END of the track when ON. In RTL
                that is leftward — `end-0.5` handles it without a direction
                check, because logical properties already mirror. */}
            <span
              className={[
                'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-400 ease-lux',
                active ? 'bg-mint' : 'bg-sand',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-6 w-6 rounded-pill bg-white shadow-pop transition-[inset-inline-start] duration-400 ease-lux',
                  active ? 'start-[1.375rem]' : 'start-0.5',
                ].join(' ')}
              />
            </span>
          </button>
        )}


        {!isNew &&
          (confirmDelete ? (
            <div className="rounded-plate border-2 border-sand bg-white px-4 py-4">
              <p className="text-base font-semibold text-espresso">להסיר את {service.name}?</p>
              <p className="he-body mt-2 text-note text-cocoa">
                {service.bookingCount > 0 ? (
                  <>
                    יש לו <Num>{service.bookingCount}</Num> תורים ביומן, אז הוא יישמר להיסטוריה
                    ויירד מהתפריט.
                  </>
                ) : (
                  'אף אחד לא קבע אותו, אז הוא יימחק לגמרי.'
                )}
              </p>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="flex-1 rounded-pill bg-espresso py-3 text-note font-semibold text-cream"
                >
                  {busy ? 'מסירים…' : 'להסיר'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-pill border-2 border-sand bg-white py-3 text-note font-semibold text-cocoa"
                >
                  להשאיר
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-note text-cocoa transition-colors duration-300 hover:text-espresso"
            >
              להסיר את הטיפול הזה
            </button>
          ))}
      </div>
    </Sheet>
  );
}
