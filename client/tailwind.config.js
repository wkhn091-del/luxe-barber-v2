/**
 * ===========================================================================
 *  LUXE BARBER — dark luxury palette
 * ===========================================================================
 *
 * The shop after hours: an onyx room, charcoal surfaces, and every accent a
 * metal — gold, silver, copper, brass. Nothing here is pure black. #0B1110
 * carries a trace of green, the way black marble does, so gold sits on it warm
 * instead of flat. Text is ivory, never #FFF, which glares on a dark ground;
 * secondary text is a soft champagne gold.
 *
 * ---------------------------------------------------------------------------
 * ROLE NAMES STAY, VALUES CHANGE
 * ---------------------------------------------------------------------------
 * The components are written against ROLE tokens: `bg-cream` means "the page",
 * `text-espresso` "the ink", `bg-white` "a raised surface", `pomegranate` "the
 * first accent". Renaming them for a colour change would touch forty files, so
 * this file remaps the roles and the markup stays as it is. New code should
 * reach for the descriptive names (onyx, charcoal, gold, …) instead.
 *
 * Accent stops keep their JOBS, not their lightness. `DEFAULT` is the fill,
 * `deep` is the stop you set text in, `soft` is the tinted ground. In a dark
 * room the readable text stop is the LIGHTER metal and the tint is the DARKER
 * one — so here `deep` is the bright end.
 *
 * ---------------------------------------------------------------------------
 * THREE TOKENS SPLIT BY UTILITY
 * ---------------------------------------------------------------------------
 * In the bright room a few tokens did two jobs that happened to share a
 * colour. In the dark they cannot, so they are set per utility further down:
 *
 *   white     bg → charcoal surface     text → onyx (it only sits on metal)
 *             border → ivory            ring → gold (the halo round the logo)
 *   espresso  text → ivory              bg, border → gold (the primary button)
 *   cocoa     text → champagne          bg → pewter (the one icon disc)
 *
 * `cream` needs no split: it is onyx for both jobs — the page, and the label
 * on a gold button.
 */

// --- The room, darkest to lightest ------------------------------------------
const ROOM = {
  onyx: '#0B1110', // the page, and the WebGL scene's background — exactly
  charcoal: '#131A19', // raised surfaces: cards, inputs, plates
  graphite: '#1B2422', // recessed surfaces: chips, tracks, skeletons
  line: '#323D3A', // hairlines and borders
  pewter: '#928D82', // muted text — 5.8:1 on onyx
  champagne: '#D0BF98', // secondary text, the soft gold — 10.6:1
  ivory: '#F2ECE1', // primary text — warm, never #FFF
};

// --- The metals -------------------------------------------------------------
// DEFAULT fills carry onyx text at 6:1 or better. `lit` is the text-on-dark
// stop and the hover state. `soft` is a tinted ground that `lit` still reads on
// at 7:1 or better.
const METAL = {
  gold: { DEFAULT: '#C8A052', lit: '#E6C57F', soft: '#231C10' },
  silver: { DEFAULT: '#AEB6BD', lit: '#D7DDE2', soft: '#161C20' },
  copper: { DEFAULT: '#C0845A', lit: '#E7AE86', soft: '#26170F' },
  brass: { DEFAULT: '#AFA16A', lit: '#D6CB98', soft: '#1E1D12' },
  pearl: { DEFAULT: '#D8CBB0', lit: '#EFE6D2', soft: '#1F1C17' },
};

/** A metal in the role vocabulary the components use: DEFAULT / deep / soft. */
const role = ({ DEFAULT, lit, soft }) => ({ DEFAULT, deep: lit, soft });

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Descriptive names — for new code.
        ...ROOM,
        ...METAL,

        // Role names — what the existing components are written against.
        cream: ROOM.onyx,
        shell: ROOM.graphite,
        sand: ROOM.line,
        haze: ROOM.pewter,
        cocoa: ROOM.champagne,
        espresso: ROOM.ivory,

        // The four service accents, still assigned by index (lib/bidi.jsx), are
        // now four metals — distinct in hue, so the menu still scans by colour.
        // The first accent is the brand: primary buttons, the first service, the
        // expiring-offer card — and errors. There is no red in this palette, so
        // an error is carried by its message and its gilded border, not by hue.
        pomegranate: role(METAL.gold),
        azure: role(METAL.silver),
        citrus: role(METAL.copper), // also warnings: the warmest, reddest metal
        mint: role(METAL.brass), // also success and WhatsApp
        grape: role(METAL.pearl), // VIP
      },

      // The split tokens — see the header.
      backgroundColor: {
        white: ROOM.charcoal,
        espresso: METAL.gold.DEFAULT,
        cocoa: '#A39C8F',
      },
      textColor: {
        white: ROOM.onyx,
      },
      borderColor: {
        white: ROOM.ivory,
        espresso: METAL.gold.DEFAULT,
      },
      ringColor: {
        white: METAL.gold.DEFAULT,
      },
      gradientColorStops: {
        // The skeleton shimmer: a lighter charcoal, not white. A white sweep
        // across a dark card reads as a flash, not as loading.
        white: '#3A4541',
      },

      fontFamily: {
        display: ['Ploni', 'Assistant', 'system-ui', 'sans-serif'],
        sans: ['Assistant', 'system-ui', '-apple-system', 'sans-serif'],
        // Hebrew faces often have weak, non-tabular figures. Prices and clocks
        // get a grotesque so columns of numerals do not jitter.
        figure: ['Inter', 'ui-sans-serif', 'system-ui'],
      },

      fontSize: {
        // Hebrew has no capitals and no ascender/descender rhythm to lean on,
        // so it wants MORE leading than Latin and tracking at or below zero.
        // There is no wide-tracked step in this scale because that look cannot
        // exist in Hebrew.
        micro: ['0.75rem', { lineHeight: '1.5', letterSpacing: '0' }],
        note: ['0.9375rem', { lineHeight: '1.65', letterSpacing: '0' }],
        base: ['1.0625rem', { lineHeight: '1.7', letterSpacing: '0' }],
        lead: ['1.25rem', { lineHeight: '1.65', letterSpacing: '-0.005em' }],
        price: ['1.75rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        d3: ['clamp(1.7rem, 4.5vw, 2.5rem)', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        d2: ['clamp(2.2rem, 7vw, 3.8rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        d1: ['clamp(2.9rem, 10vw, 6rem)', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        clock: ['clamp(3.4rem, 17vw, 5.4rem)', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },

      borderRadius: { plate: '10px', sheet: '20px', glass: '26px', pill: '999px' },

      transitionTimingFunction: {
        lux: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spatial: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: { 400: '400ms', 600: '600ms' },

      boxShadow: {
        /* BLACK shadows, deeper and longer than on a bright page — plus one lit
           pixel along the top edge. When the surface and the ground are both
           nearly black, that edge is what makes a card read as raised. */
        card: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 48px -24px rgba(0,0,0,0.85), 0 2px 10px -4px rgba(0,0,0,0.6)',
        /* Buttons are metal: a bright bevel on top, a dark one underneath, and
           — on the big ones — a faint gold glow on the ground below. */
        lift: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.28), 0 24px 50px -22px rgba(0,0,0,0.9), 0 12px 32px -16px rgba(200,160,82,0.4)',
        pop: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.25), 0 10px 26px -12px rgba(0,0,0,0.85)',
      },

      keyframes: {
        rise: { from: { opacity: '0', transform: 'translate3d(0,1.1em,0)' }, to: { opacity: '1', transform: 'none' } },
        nudge: {
          '0%,100%': { transform: 'translate3d(-50%,-50%,0)' },
          '40%': { transform: 'translate3d(calc(-50% - 9px),-50%,0)' },
          '70%': { transform: 'translate3d(calc(-50% + 5px),-50%,0)' },
        },
        breathe: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        sheetUp: { from: { transform: 'translate3d(0,100%,0)' }, to: { transform: 'none' } },
        veilIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        ticking: { to: { backgroundPosition: '0 -12px' } },
        shake: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '20%': { transform: 'translate3d(-8px,0,0)' },
          '40%': { transform: 'translate3d(7px,0,0)' },
          '60%': { transform: 'translate3d(-4px,0,0)' },
          '80%': { transform: 'translate3d(2px,0,0)' },
        },
        // Skeletons sweep from the RIGHT. A left-to-right shimmer under Hebrew
        // reads backwards.
        sweepRtl: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(-200%)' } },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        rise: 'rise 900ms cubic-bezier(0.16,1,0.3,1) both',
        nudge: 'nudge 1.6s cubic-bezier(0.16,1,0.3,1) 900ms 2',
        breathe: 'breathe 2s ease-in-out infinite',
        'sheet-up': 'sheetUp 420ms cubic-bezier(0.16,1,0.3,1) both',
        'veil-in': 'veilIn 300ms cubic-bezier(0.16,1,0.3,1) both',
        ticking: 'ticking 900ms linear infinite',
        shake: 'shake 420ms cubic-bezier(0.36,0.07,0.19,0.97) both',
        'sweep-rtl': 'sweepRtl 1.9s cubic-bezier(0.16,1,0.3,1) infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.16,1,0.3,1) infinite',
      },
    },
  },
  plugins: [],
};
