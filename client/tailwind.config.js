/** @type {import('tailwindcss').Config} */

// Resolve a colour through its CSS variable while leaving Tailwind's alpha
// modifier intact. The variable holds space-separated RGB channels, so
// `bg-board/80` becomes rgb(var(--board) / 0.8).
const c = (name) => `rgb(var(${name}) / <alpha-value>)`;

// THE TOTE BOARD (seed d086c314)
// An enamelled steel chassis read under lamplight. Four roles own whole
// regions of the page, not accents scattered on neutral: the board itself,
// the lamps that print values onto it, the bone flip-tiles, and the signals.
//
// Every contrast figure below is measured against the chassis (#14150F,
// relative luminance 0.0072) and verified in Node, not estimated.

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Archivo: American gothic grotesque. Carries the plate-set board
        // lettering at display weight and still works as UI text at 14px.
        display: ['"Archivo"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Archivo"', "ui-sans-serif", "system-ui", "sans-serif"],
        // Martian Mono is the lamp matrix: wide, mechanical, unmistakably
        // machine-printed. Right for numerals and wallet codes.
        mono: ['"Martian Mono"', "ui-monospace", "monospace"],
        // Dense tabular data where Martian Mono's width would overflow.
        // Archivo's tnum figures, same face as everything else.
        data: ['"Archivo"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Every token resolves through a CSS variable defined in index.css,
        // where the dark and light palettes live. The channel syntax is what
        // keeps Tailwind's alpha modifiers working: `bg-lamp/10` still
        // compiles, it just reads the current lighting. Contrast figures for
        // both lightings are recorded beside the variables, measured in Node.
        board: {
          void: c("--board-void"),
          DEFAULT: c("--board"),
          rail: c("--board-rail"),
          slot: c("--board-slot"),
          rule: c("--board-rule"),
        },
        lamp: {
          DEFAULT: c("--lamp"),
          hot: c("--lamp-hot"),
          dim: c("--lamp-dim"),
        },
        bone: { DEFAULT: c("--bone"), dim: c("--bone-dim") },
        success: c("--success"),
        danger: c("--danger"),
        premium: c("--premium"),
        // A translucent film over the ground. The interior used literal
        // `white/10` for this, which is correct on a dark board and invisible
        // on a pale one; `hair` is whichever of the two the lighting needs.
        hair: c("--hair"),
        // `brand` stays the token name so 60-odd existing usages inherit the
        // world instead of needing a rename; it still means "lamp".
        brand: {
          DEFAULT: c("--lamp"),
          dark: c("--lamp-dark"),
          light: c("--lamp-hot"),
        },
        accent: c("--lamp"),
        muted: c("--bone-dim"),
        // Tailwind's stock `slate` is a cool blue-grey that fights the enamel.
        // Overriding the scale warms the whole interior; the light palette
        // also mirrors it end for end, so `text-slate-200` stays legible
        // rather than turning into pale-on-pale.
        slate: {
          100: c("--slate-100"),
          200: c("--slate-200"),
          300: c("--slate-300"),
          400: c("--slate-400"),
          500: c("--slate-500"),
          600: c("--slate-600"),
          700: c("--slate-700"),
          800: c("--slate-800"),
          900: c("--slate-900"),
          950: c("--slate-950"),
        },
        ink: {
          950: c("--ink-950"),
          900: c("--ink-900"),
          800: c("--ink-800"),
          700: c("--ink-700"),
          600: c("--ink-600"),
        },
      },
      // Tailwind's preflight sets every element's border-color to its own
      // #e5e7eb grey. It is inert while border-width is 0, but the moment
      // anyone writes a bare `border` they get a stock light grey that belongs
      // to neither lighting. Pointing the default at the painted hairline
      // makes the accident harmless.
      borderColor: { DEFAULT: c("--board-rule") },
      boxShadow: {
        // Enamel has real depth. Rails sit proud of the chassis; slots are
        // milled into it. Both carry an offset and a soft blur.
        rail: "0 1px 0 rgb(var(--hair) / 0.05) inset, 0 6px 20px -12px rgb(var(--veil) / 0.9)",
        slot: "0 2px 6px rgb(var(--veil) / 0.55) inset, 0 -1px 0 rgb(var(--hair) / 0.04) inset",
        tile: "0 1px 0 rgb(var(--hair) / 0.06) inset, 0 2px 8px -4px rgb(var(--veil) / 0.8)",
        lamp: "0 0 24px -6px rgb(var(--lamp) / 0.45)",
        soft: "0 1px 2px rgb(var(--veil) / 0.35)",
        elevated: "0 6px 20px -10px rgb(var(--veil) / 0.75)",
        glow: "none",
      },
      borderRadius: {
        // Machined, not app-rounded. The chassis has a 2px break; tiles are
        // effectively square.
        "2.5xl": "0.25rem",
      },
      letterSpacing: {
        plate: "0.14em", // engraved plate lettering
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // The one authored moment: each row's tile flips down and settles.
        // Starts from an already-visible state so content never depends on it.
        settle: {
          "0%": { transform: "rotateX(-62deg)", filter: "brightness(0.55)" },
          "70%": { transform: "rotateX(6deg)", filter: "brightness(1.06)" },
          "100%": { transform: "rotateX(0deg)", filter: "brightness(1)" },
        },
        filament: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.82" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both",
        settle: "settle 0.42s cubic-bezier(0.16,1,0.3,1) both",
        filament: "filament 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
