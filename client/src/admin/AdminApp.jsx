import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { admin, adminAuth } from '../lib/adminApi.js';
import EnrolDevice from './EnrolDevice.jsx';
import PinLock from './PinLock.jsx';
import Today from './Today.jsx';
import Queue from './Queue.jsx';
import Services from './Services.jsx';
import GalleryUploader from './GalleryUploader.jsx';
import More from './More.jsx';
import BackBar from './BackBar.jsx';
import Clients from './Clients.jsx';
import Settings from './Settings.jsx';
import CalendarFeed from './CalendarFeed.jsx';
import SheetFeed from './SheetFeed.jsx';
// The manual is long and rarely opened: loaded on demand, so the dashboard's
// first load stays as light as before.
const UserManual = lazy(() => import('./UserManual.jsx'));

/** Pages reached through "עוד". They share its tab, and a way back to it. */
const MORE_PAGES = ['gallery', 'clients', 'settings', 'calendar', 'sheet', 'manual'];
// Pages that read better wider on a desktop screen (phones are unaffected).
const WIDE_PAGES = ['manual'];
import TimeRangeSheet from './TimeRangeSheet.jsx';

/**
 * ===========================================================================
 *  לוח הבקרה — the barber's dashboard
 * ===========================================================================
 *
 * Three gates, in order:
 *
 *   no device enrolled  → EnrolDevice  (email, password, choose a code)
 *   device, no token    → PinLock      (six digits)
 *   token               → the app
 *
 * The middle state is the one that matters. A 12-hour JWT means the barber is
 * locked out roughly every morning — and every morning they should see a
 * keypad, not an email form. `adminAuth` fires `locked` on a 401 when a device
 * is enrolled, and `signedOut` only when the device itself is gone.
 *
 * ---------------------------------------------------------------------------
 * RTL and the warm theme
 * ---------------------------------------------------------------------------
 * `dir="rtl"` lives here, on the dashboard root, and the old `dir="ltr"` island
 * in App.jsx is gone. Everything below uses LOGICAL properties — `ps-`/`pe-`,
 * `ms-`/`me-`, `text-start`/`text-end`, `border-s`. Any surviving `pl-`/`pr-`
 * or `text-right` is a mirroring bug that only a Hebrew reader will notice,
 * which is exactly why they are worth hunting.
 *
 * Mobile-first in the literal sense: there is no desktop layout, only a
 * comfortable maximum width. The barber uses this standing up, between cuts,
 * with one hand — so navigation is a bottom tab bar in the thumb arc, every
 * target clears 44px, and the single most valuable action sits in the middle
 * of that bar rather than behind a menu.
 */
export default function AdminApp() {
  const [barber, setBarber] = useState(null);
  const [phase, setPhase] = useState(() =>
    adminAuth.token ? 'checking' : adminAuth.enrolled ? 'locked' : 'enrol'
  );
  const [tab, setTab] = useState('today');
  const [openHours, setOpenHours] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const verify = useCallback(() => {
    setPhase('checking');
    admin
      .me()
      .then((d) => {
        setBarber(d.barber);
        setPhase('ready');
      })
      .catch(() => {
        // adminAuth has already decided whether this is a lock or a sign-out.
        setPhase(adminAuth.enrolled ? 'locked' : 'enrol');
      });
  }, []);

  useEffect(() => {
    adminAuth.on({
      locked: () => setPhase('locked'),
      signedOut: () => {
        setBarber(null);
        setPhase('enrol');
      },
    });
  }, []);

  useEffect(() => {
    if (adminAuth.token) verify();
  }, [verify]);

  if (phase === 'enrol') return <EnrolDevice onReady={verify} />;
  if (phase === 'locked') return <PinLock onUnlocked={verify} />;

  if (phase === 'checking' || !barber) {
    return (
      <div dir="rtl" className="grid min-h-[100dvh] place-items-center bg-cream">
        <div className="flex gap-1.5" role="status" aria-label="טוען">
          {['bg-pomegranate', 'bg-citrus', 'bg-azure'].map((c) => (
            <span key={c} className={`h-2 w-2 animate-breathe rounded-full ${c}`} />
          ))}
        </div>
      </div>
    );
  }

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div dir="rtl" className={`grain mx-auto min-h-[100dvh] max-w-md bg-cream ${WIDE_PAGES.includes(tab) ? 'md:max-w-2xl' : ''}`}>
      {tab === 'today' && <Today key={refreshKey} barber={barber} />}
      {tab === 'queue' && <Queue key={refreshKey} barber={barber} />}
      {tab === 'services' && <Services key={refreshKey} barber={barber} />}
      {tab === 'more' && <More onOpen={setTab} />}
      {MORE_PAGES.includes(tab) && <BackBar onBack={() => setTab('more')} />}
      {tab === 'gallery' && <GalleryUploader key={refreshKey} />}
      {tab === 'clients' && <Clients barber={barber} />}
      {tab === 'settings' && <Settings />}
      {tab === 'calendar' && <CalendarFeed />}
      {tab === 'sheet' && <SheetFeed />}
      {tab === 'manual' && (
        <Suspense fallback={<div className="px-5 pt-5"><div className="h-72 animate-breathe rounded-plate bg-shell" /></div>}>
          <UserManual />
        </Suspense>
      )}

      <TabBar
        tab={tab}
        onTab={setTab}
        onOpenHours={() => setOpenHours(true)}
        // Locking, not signing out: the device stays enrolled, so getting back
        // in is six digits. A full sign-out is deliberately NOT on the tab bar,
        // where it could be hit by accident between cuts.
        onLock={() => adminAuth.lock()}
      />

      <TimeRangeSheet
        open={openHours}
        mode="open"
        timeZone={barber.timezone}
        granularityMin={barber.slotGranularityMin}
        onClose={() => setOpenHours(false)}
        onChanged={() => {
          setOpenHours(false);
          setTab('today');
          refresh();
        }}
      />
    </div>
  );
}

/**
 * Four destinations and one action.
 *
 * The action is pomegranate and raised because it is the only control here that
 * MAKES the shop money rather than just showing it — opening hours pushes the
 * waitlist engine to message people immediately.
 */
function TabBar({ tab, onTab, onOpenHours, onLock }) {
  const isCurrent = (key) => tab === key || (key === 'more' && MORE_PAGES.includes(tab));
  const item = (key, label, icon) => (
    <button
      type="button"
      onClick={() => onTab(key)}
      aria-current={isCurrent(key)}
      className={[
        'flex flex-1 flex-col items-center gap-1 py-3 text-micro font-semibold transition-colors duration-300 ease-lux',
        isCurrent(key) ? 'text-espresso' : 'text-haze hover:text-cocoa',
      ].join(' ')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon}
      </svg>
      {label}
    </button>
  );

  return (
    <nav className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-sand bg-cream/95 pb-safe backdrop-blur-md ${WIDE_PAGES.includes(tab) ? 'md:max-w-2xl' : ''}`}>
      <div className="flex items-center px-1.5">
        {item('today', 'היום', <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>)}
        {item('queue', 'רשימה', <><path d="M3 6h18M3 12h18M3 18h12" /></>)}

        <button
          type="button"
          onClick={onOpenHours}
          aria-label="לפתוח שעות"
          className="mx-1 -mt-6 grid h-14 w-14 shrink-0 place-items-center rounded-pill bg-pomegranate text-white shadow-lift transition-transform duration-300 ease-lux active:scale-95"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {item('services', 'תפריט', <><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="19" cy="17" r="2" /></>)}
        {item('more', 'עוד', <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>)}

        <button
          type="button"
          onClick={onLock}
          aria-label="נעילה"
          className="flex w-11 shrink-0 justify-center py-3 text-haze transition-colors duration-300 ease-lux hover:text-cocoa"
        >
          <svg width="18" height="18" viewBox="0 0 16 18" fill="none" aria-hidden="true">
            <rect x="1" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 7V4.5a3.5 3.5 0 1 1 7 0V7" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
