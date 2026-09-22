import { Link } from 'react-router-dom';

/**
 * Under the contact fields of both booking forms:
 *   - remember me on this device — on by default, saved only after success;
 *   - last-minute-slot emails — OFF by default: Israel's anti-spam law needs an
 *     active opt-in, and every such email carries its own unsubscribe link;
 *   - the privacy policy, opened in a new tab so the booking is not lost.
 */
export default function ClientExtras({ value, onChange, memory }) {
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={memory.on}
          onChange={(e) => memory.set(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-pomegranate"
        />
        <span className="text-note text-cocoa">לזכור את הפרטים במכשיר הזה לפעם הבאה</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={Boolean(value.marketingOptIn)}
          onChange={(e) => onChange({ ...value, marketingOptIn: e.target.checked })}
          className="mt-1 h-5 w-5 shrink-0 accent-pomegranate"
        />
        <span className="text-note text-cocoa">אשמח לקבל מייל כשמתפנה תור ברגע האחרון (אפשר להסיר בכל רגע)</span>
      </label>
      <p className="text-micro text-haze">
        {memory.saved && (
          <>
            הפרטים מולאו מהמכשיר הזה.{' '}
            <button type="button" onClick={memory.forget} className="underline underline-offset-2 hover:text-cocoa">
              לא אתם? ניקוי
            </button>
            {' · '}
          </>
        )}
        <Link to="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-cocoa">
          מדיניות פרטיות
        </Link>
      </p>
    </div>
  );
}
