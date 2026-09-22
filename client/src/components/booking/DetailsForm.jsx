import { useState } from 'react';
import { isEmail } from '../../lib/email.js';
import ClientExtras from './ClientExtras.jsx';

/**
 * ===========================================================================
 *  פרטים — name, phone and email (required: it carries the confirmation)
 * ===========================================================================
 *
 * Phone is the client's natural key in the backend (E.164, unique), so it is
 * required. Email is optional — and it is the only channel that confirms a
 * booking AUTOMATICALLY, because WhatsApp is sent by hand from the admin. The
 * line under the fields says exactly that, so nobody waits for a message that
 * was never going to arrive.
 *
 * Three details that matter specifically in Hebrew:
 *
 *   1. Phone and email are `dir="ltr"` with right alignment. Both are LTR
 *      strings: typed into an RTL field the caret sits on the wrong side and
 *      "050" drifts to the end as you type. Right alignment keeps them anchored
 *      under their Hebrew labels.
 *   2. `inputMode` brings up the right keyboard (digits, then @), and
 *      `autoComplete` lets iOS and Android fill all three in one tap.
 *   3. The email check is the server's own pattern, so the form can never
 *      accept an address the API would then reject.
 */
export default function DetailsForm({ value, onChange, onSubmit, submitting, error, summary, theme, memory }) {
  const [touched, setTouched] = useState({});

  const invalid = {
    name: value.name.trim().length < 2,
    phone: value.phone.replace(/\D/g, '').length < 9,
    email: !isEmail(value.email),
  };
  const canSubmit = !invalid.name && !invalid.phone && !invalid.email && !submitting;

  const field = (key, label, hint, props, aside) => (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-note font-semibold text-espresso">{label}</span>
        {aside && <span className="text-micro text-haze">{aside}</span>}
      </span>
      <input
        {...props}
        value={value[key] ?? ''}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
        aria-invalid={touched[key] && invalid[key] ? 'true' : undefined}
        className={[
          'mt-2 w-full rounded-plate border-2 bg-white px-4 py-3.5 text-base text-espresso',
          'placeholder:text-haze transition-colors duration-300',
          touched[key] && invalid[key] ? 'border-pomegranate' : 'border-sand focus:border-espresso',
        ].join(' ')}
      />
      {touched[key] && invalid[key] && (
        <span className="mt-1.5 block text-micro text-pomegranate-deep">{hint}</span>
      )}
    </label>
  );

  return (
    <div className="space-y-5">
      {summary}

      {field('name', 'שם', 'נדרש שם מלא', {
        type: 'text',
        autoComplete: 'name',
        placeholder: 'מה השם שלכם?',
        enterKeyHint: 'next',
      })}

      {field('phone', 'טלפון נייד', 'מספר טלפון לא תקין', {
        type: 'tel',
        inputMode: 'tel',
        autoComplete: 'tel',
        placeholder: '050-000-0000',
        enterKeyHint: 'next',
        dir: 'ltr',
        style: { textAlign: 'right' },
      })}

      {field(
        'email',
        'מייל',
        'כתובת המייל לא נראית תקינה',
        {
          type: 'email',
          inputMode: 'email',
          autoComplete: 'email',
          autoCapitalize: 'none',
          spellCheck: false,
          placeholder: 'name@example.com',
          enterKeyHint: 'done',
          dir: 'ltr',
          style: { textAlign: 'right' },
        }
      )}

      <p className="he-body text-note text-cocoa">
        לכאן נשלח את אישור התור ותזכורת יום לפני.
      </p>

      <ClientExtras value={value} onChange={onChange} memory={memory} />

      {error && (
        <p role="alert" className="rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={[
          'w-full rounded-pill py-4 text-base font-semibold text-white shadow-pop',
          'transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98]',
          theme.btn,
          'disabled:opacity-40',
        ].join(' ')}
      >
        {submitting ? 'קובעים תור…' : 'לאשר את התור'}
      </button>

      {/* Stated as a plain fact about the shop, not hedged into a disclaimer.
          There is nothing to apologise for about cash. */}
      <p className="text-center text-note text-cocoa">משלמים במזומן במקום. בלי מקדמה, בלי אשראי.</p>
    </div>
  );
}
