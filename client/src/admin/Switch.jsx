/** An on/off switch. In RTL the "on" knob sits to the left, as in Hebrew iOS. */
export default function Switch({ on, onToggle, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'flex h-7 w-12 shrink-0 touch-manipulation items-center rounded-pill px-1 transition-colors duration-300 disabled:opacity-50',
        on ? 'justify-end bg-pomegranate' : 'justify-start bg-sand',
      ].join(' ')}
    >
      <span className="h-5 w-5 rounded-pill bg-cream shadow-pop" />
    </button>
  );
}
