/**
 * "עוד" — everything that is not the day's work, one tap away.
 * Rows, not icons: each says what it does, because a barber between cuts
 * should never have to guess.
 */
const ITEMS = [
  {
    key: 'clients',
    title: 'לקוחות',
    note: 'חיפוש, פרטים ומחיקה — גם של נתוני הדמו',
    icon: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.6M18 19a5 5 0 0 0-2.5-4.3" /></>,
  },
  {
    key: 'settings',
    title: 'פרטי העסק',
    note: 'שעות פעילות, מצב חופשה, טלפון וכתובת — מתעדכן באתר מיד',
    icon: <><path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  },
  {
    key: 'calendar',
    title: 'היומן בטלפון',
    note: 'כל התורים ביומן של האייפון או של Google — מתעדכן לבד',
    icon: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  },
  {
    key: 'sheet',
    title: 'גיליון חי',
    note: 'כל התורים ב־Excel או Google Sheets — מתעדכן לבד',
    icon: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9h17M3.5 14h17M9.5 4v16" /></>,
  },
  {
    key: 'gallery',
    title: 'גלריה',
    note: 'תמונות העבודות שבאתר',
    icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" /></>,
  },
  {
    key: 'manual',
    title: 'מדריך למשתמש',
    note: 'כל ההסברים, צעד אחר צעד — כניסה, גיליון חי ובעיות נפוצות',
    icon: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /><path d="M9 8h7M9 11.5h5" /></>,
  },
];

export default function More({ onOpen }) {
  return (
    <div className="px-5 pb-28 pt-7">
      <h1 className="font-display text-d3 font-semibold text-espresso">עוד</h1>
      <div className="mt-6 space-y-3">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpen(item.key)}
            className="flex w-full touch-manipulation items-center gap-4 rounded-plate border-2 border-sand bg-white p-4 text-start transition-[border-color,transform] duration-300 ease-lux hover:border-cocoa/40 active:scale-[0.99]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-shell text-pomegranate-deep">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-espresso">{item.title}</span>
              <span className="mt-0.5 block text-note text-cocoa">{item.note}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-haze">
              <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
