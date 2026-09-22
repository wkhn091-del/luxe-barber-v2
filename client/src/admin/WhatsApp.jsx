import { useState } from 'react';
import { waLink } from '../lib/whatsapp.js';

/**
 * ===========================================================================
 *  וואטסאפ — the manual half of the free notification setup
 * ===========================================================================
 *
 * Email goes out on its own. Everything else — a client who left no email, an
 * offer that needs a nudge, a reminder the barber wants to send personally —
 * is one tap here: WhatsApp opens with the message already written, the barber
 * reads it and presses send.
 *
 * The preview is the exact text, WhatsApp's *bold* included, so nothing leaves
 * this screen unread. The icon is a plain chat bubble on purpose: the label
 * says וואטסאפ; the mark only needs to say "message".
 */

export function ChatGlyph({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.75c-4.83 0-8.75 3.36-8.75 7.5 0 2.2 1.1 4.18 2.87 5.55L5.4 20.25l3.86-1.9c.87.25 1.8.4 2.74.4 4.83 0 8.75-3.36 8.75-7.5S16.83 3.75 12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.6 11.25h.01M12 11.25h.01M15.4 11.25h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** WhatsApp's `*bold*`, rendered as bold — the preview reads like the chat will. */
function Formatted({ text }) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? (
      <strong key={i} className="font-semibold text-espresso">
        {part.slice(1, -1)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/**
 * Who hears from the system on their own. `undefined` means an API that does
 * not send the field yet — then say nothing rather than guess.
 */
function EmailStatus({ email }) {
  if (email === undefined) return null;
  return email ? (
    <span className="flex items-center gap-1 rounded-pill bg-mint-soft px-2.5 py-1 text-micro font-semibold text-mint-deep">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      מייל אוטומטי
    </span>
  ) : (
    <span className="rounded-pill bg-citrus-soft px-2.5 py-1 text-micro font-semibold text-citrus-deep">אין מייל</span>
  );
}

/**
 * @param {object}   props
 * @param {string}   props.phone
 * @param {string|null} [props.email]  the client's email; undefined = unknown
 * @param {{key:string,label:string,text:string}[]} props.options
 * @param {string}   [props.initial]   key of the option to open on
 */
export function WhatsAppPanel({ phone, email, options, initial }) {
  const [key, setKey] = useState(initial ?? options[0]?.key);
  if (!options.length) return null;

  const active = options.find((o) => o.key === key) ?? options[0];
  const href = waLink(phone, active.text);

  return (
    <section aria-label="הודעה בוואטסאפ" className="rounded-glass border-2 border-sand bg-white p-4 shadow-card">
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-base font-semibold text-espresso">
          <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-mint-soft text-mint-deep">
            <ChatGlyph className="h-5 w-5" />
          </span>
          וואטסאפ
        </span>
        <EmailStatus email={email} />
      </header>

      {email === null && (
        <p className="he-body mt-3 text-note text-cocoa">
          ללקוח אין כתובת מייל, אז שום הודעה לא יצאה אליו אוטומטית. מכאן הוא ישמע מכם.
        </p>
      )}

      {options.length > 1 && (
        <div role="radiogroup" aria-label="איזו הודעה" className="mt-4 grid grid-flow-col gap-1 rounded-pill bg-shell p-1">
          {options.map((option) => {
            const on = option.key === active.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKey(option.key)}
                className={[
                  'rounded-pill py-2 text-note font-semibold transition-[background-color,color,box-shadow] duration-300 ease-lux',
                  on ? 'bg-white text-espresso shadow-card' : 'text-cocoa hover:text-espresso',
                ].join(' ')}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {/* An outgoing bubble. In Hebrew WhatsApp those sit on the left — the
          END side in RTL — with the tail at the top corner. */}
      <div className="mt-4 flex justify-end">
        <p className="he-body max-w-[88%] whitespace-pre-line rounded-[18px] rounded-tl-[6px] bg-mint-soft px-4 py-3 text-note leading-relaxed text-cocoa">
          <Formatted text={active.text} />
        </p>
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-pill bg-mint-deep py-3.5 text-base font-semibold text-white shadow-pop transition-transform duration-300 ease-lux active:scale-[0.98]"
        >
          <ChatGlyph className="h-5 w-5" />
          שליחה בוואטסאפ
        </a>
      ) : (
        <p role="alert" className="mt-4 rounded-plate bg-citrus-soft px-4 py-3 text-note text-citrus-deep">
          המספר של הלקוח לא נראה תקין לוואטסאפ.
        </p>
      )}

      <p className="mt-2.5 text-center text-micro text-haze">נפתח וואטסאפ עם ההודעה מוכנה — נשאר רק ללחוץ שליחה.</p>
    </section>
  );
}

/** The compact form, for list rows. `iconOnly` keeps the label for screen readers. */
export function WhatsAppChip({ phone, text, label = 'וואטסאפ', solid = false, iconOnly = false }) {
  const href = waLink(phone, text);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill font-semibold transition-transform duration-300 ease-lux active:scale-[0.96]',
        iconOnly ? 'h-9 w-9' : 'px-3.5 py-1.5 text-micro',
        solid ? 'bg-mint-deep text-white shadow-pop' : 'border-2 border-mint/40 bg-white text-mint-deep',
      ].join(' ')}
    >
      <ChatGlyph className={iconOnly ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
      {!iconOnly && label}
    </a>
  );
}
