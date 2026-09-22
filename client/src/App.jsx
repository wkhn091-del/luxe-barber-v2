import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Home from './pages/Home.jsx';
import OfferPage from './pages/OfferPage.jsx';
import ReloadPrompt from './pwa/ReloadPrompt.jsx';
import Privacy from './pages/Privacy.jsx';
import Accessibility from './pages/Accessibility.jsx';
import ManagePage from './pages/ManagePage.jsx';

// The admin is a separate chunk. A client landing on the homepage should never
// download the barber's dashboard.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
// Rarely visited, so they load on demand and never weigh on the homepage.
const Help = lazy(() => import('./pages/Help.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const Loading = () => (
  <div className="grid min-h-[100dvh] place-items-center bg-cream">
    <div className="flex gap-1.5" role="status" aria-label="טוען">
      {['bg-pomegranate', 'bg-citrus', 'bg-azure'].map((c) => (
        <span key={c} className={`h-2 w-2 animate-breathe rounded-full ${c}`} />
      ))}
    </div>
  </div>
);

/**
 * The whole app is RTL now — client side AND admin.
 *
 * The `dir="ltr"` island that used to wrap /admin/* is gone. It existed only
 * because the dashboard's copy was English, and English right-aligned inside an
 * RTL document pushes punctuation to the wrong end of every line. With the
 * admin translated there is nothing left to quarantine, and leaving the island
 * in would now do the damage itself — it would flip the barber's own interface
 * back to left-aligned.
 */
export default function App() {
  return (
    // Outermost, so a crash anywhere — a page, the router, a lazy chunk that
    // failed to load after a deploy — lands on the same calm fallback.
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/help" element={<Help />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/accessibility" element={<Accessibility />} />
            {/* The link in the WhatsApp/SMS offer. Kept short on purpose — it has
                to survive being read off a lock screen. */}
            <Route path="/o/:token" element={<OfferPage />} />
            {/* Manage-booking link from the confirmation message. */}
            <Route path="/b/:token" element={<ManagePage />} />
            <Route path="/admin/*" element={<AdminApp />} />
            {/* Anything else — an old link, a typo — gets a real page, not a blank one. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        {/* Registers the service worker on every route, and offers new versions. */}
        <ReloadPrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
