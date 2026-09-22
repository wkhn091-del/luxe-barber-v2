import { useState } from 'react';
import { admin } from '../lib/adminApi.js';

/**
 * "ייצוא לאקסל": every appointment as a CSV that Excel opens with the Hebrew
 * intact. The server mints a 5-minute signed link and the browser downloads it
 * natively — which, unlike a blob built in JavaScript, also works on iPhone.
 */
export default function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await admin.exportLink();
      window.location.href = url; // a file download: the admin page stays where it is
    } catch (err) {
      setError(err.message);
    } finally {
      setTimeout(() => setBusy(false), 1500);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-micro text-pomegranate-deep">{error}</span>}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex touch-manipulation items-center gap-1.5 rounded-pill border-2 border-sand px-3.5 py-1.5 text-micro font-semibold text-cocoa transition-colors duration-300 hover:text-espresso disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? 'מכינים…' : 'ייצוא לאקסל'}
      </button>
    </span>
  );
}
