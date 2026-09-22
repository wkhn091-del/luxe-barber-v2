/** The way back from a page under "עוד". In RTL "back" points right, toward where you came from. */
export default function BackBar({ onBack }) {
  return (
    <div className="px-5 pt-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex touch-manipulation items-center gap-1.5 rounded-pill border-2 border-sand px-4 py-2 text-note font-semibold text-cocoa transition-colors duration-300 hover:text-espresso"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        עוד
      </button>
    </div>
  );
}
