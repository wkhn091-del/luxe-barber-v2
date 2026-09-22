import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The room. Browser chrome, the Android splash and the status bar all take
 * this colour, so the installed app is one continuous dark surface from the
 * edge of the glass inward. Same value as `onyx` in tailwind.config.js and the
 * WebGL background in HeroScene.jsx.
 */
const ONYX = '#0B1110';
const DAY = 24 * 60 * 60;

/**
 * Open Graph tags, for the preview card when the link is shared on WhatsApp.
 *
 * WhatsApp will not show an image from a relative path, so the URLs are made
 * absolute from VITE_PUBLIC_SITE_URL — or, on Vercel, from
 * VERCEL_PROJECT_PRODUCTION_URL, which Vercel sets on every build. Without
 * either, the image path stays relative and the page-address tags are left out
 * rather than written wrong.
 *
 * Injected as finished tags AFTER Vite's own HTML processing ('post'): a
 * placeholder in index.html would be run through Vite's URL handling first.
 */
function openGraph() {
  const site = (
    process.env.VITE_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/+$/, '');
  const og = (property, content) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' });
  return {
    name: 'luxe-open-graph',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        og('og:type', 'website'),
        og('og:locale', 'he_IL'),
        og('og:site_name', 'לוקסי'),
        og('og:title', 'לוקסי · מספרה בתיאום מראש'),
        og('og:description', 'בוחרים טיפול, בוחרים שעה, מגיעים. השבוע מלא? נכנסים לרשימה ומקבלים הודעה ברגע שמתפנה מקום.'),
        og('og:image', `${site}/og-image.jpg`),
        og('og:image:type', 'image/jpeg'),
        og('og:image:width', '1200'),
        og('og:image:height', '630'),
        og('og:image:alt', 'לוקסי — מספרה בתיאום מראש'),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
        ...(site
          ? [og('og:url', `${site}/`), { tag: 'link', attrs: { rel: 'canonical', href: `${site}/` }, injectTo: 'head' }]
          : []),
      ],
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    openGraph(),

    VitePWA({
      // A new version waits for the user's say-so (src/pwa/ReloadPrompt.jsx).
      // 'autoUpdate' would reload the page on its own — and a deploy at 4pm
      // would wipe out someone halfway through typing their phone number.
      registerType: 'prompt',
      // ReloadPrompt registers through virtual:pwa-register/react. Letting the
      // plugin inject its own script as well would register the worker twice.
      injectRegister: false,

      manifest: {
        id: '/',
        name: 'לוקסי · מספרה בתיאום מראש',
        short_name: 'לוקסי',
        description:
          'כיסא אחד, ספר אחד, בתיאום מראש. קביעת תור בלחיצה, ורשימת המתנה שמודיעה ברגע שמתפנה מקום.',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: ONYX,
        theme_color: ONYX,
        categories: ['lifestyle', 'business'],
        icons: [
          // "any": a rounded dark tile, for desktops that show the icon as-is.
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // "maskable": full bleed, the emblem inside the 80% safe circle, so
          // Android can cut it to any launcher shape without clipping the ring.
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the icon on Android: straight to the treatments.
        shortcuts: [
          {
            name: 'קביעת תור',
            short_name: 'קביעת תור',
            description: 'ישר לתפריט הטיפולים',
            url: '/#menu',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // With screenshots, Android shows a store-style install sheet instead of
        // a one-line dialog.
        screenshots: [
          { src: '/screenshots/home-narrow.webp', sizes: '390x844', type: 'image/webp', form_factor: 'narrow', label: 'לוקסי — המסך הראשי' },
          { src: '/screenshots/home-wide.webp', sizes: '1280x800', type: 'image/webp', form_factor: 'wide', label: 'לוקסי — המסך הראשי במחשב' },
        ],
      },

      workbox: {
        // The app shell: everything the build emits, so the installed app
        // opens with no signal at all. Launch screens and store screenshots stay
        // out — a device needs one launch screen, fetched on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        globIgnores: ['splash/**', 'screenshots/**', 'models/**', 'draco/**', 'og-image.*'],
        // three.js is a ~680 KB chunk; the 2 MiB default passes it today, and
        // this leaves room for it to grow without the build silently dropping
        // it from the precache.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // The very first worker takes control of the page that installed it.
        // Without this a first-time visitor stays uncontrolled for the whole
        // visit — and a "רענון" tapped during that visit would have no worker
        // to hand the page over to. Updates still wait for the tap: this is
        // not skipWaiting.
        clientsClaim: true,
        navigateFallback: 'index.html',
        // The API is never answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // The price list and the shop card are worth having offline: the
            // installed app should open to the menu, the address and the phone
            // number even in a dead zone. Network first, so a new price shows
            // up the moment there is signal.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/(shop|services|gallery)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'luxe-catalog',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 7 * DAY },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Everything else under /api is live state — free slots, offers,
            // bookings, and the whole admin. A cached answer there is a wrong
            // answer, and admin data must never sit in a cache on a shared phone.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The 3D model and its Draco decoder: megabytes, so never precached —
            // fetched the first time the hero shows, then kept for offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/(models|draco)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'luxe-3d',
              expiration: { maxEntries: 12, maxAgeSeconds: 30 * DAY },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Gallery photos never change once uploaded. Capped, and CORS-only:
            // an opaque cross-origin image costs megabytes of quota apiece.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'luxe-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },

      // No worker under `npm run dev`: a cached shell in development serves
      // yesterday's code. Test offline with `npm run build && npm run preview`.
      devOptions: { enabled: false },
    }),
  ],

  build: {
    rollupOptions: {
      output: {
        // three + drei is ~900 KB. Split out so the offer countdown page and
        // the admin dashboard — which barely touch it — do not pay for it up
        // front.
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },

  server: { proxy: { '/api': 'http://localhost:4000' } },
});
