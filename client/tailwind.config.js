/** @type {import('tailwindcss').Config} */

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
        // --- The board itself -------------------------------------------
        // Warm-olive enamel over steel. Never blue-black; a blue ground
        // turns the amber green and the whole thing reads as a UI again.
        board: {
          void: "#0D0E09", // behind the board — the dark of the concourse
          DEFAULT: "#14150F", // the chassis face
          rail: "#1C1E15", // raised header and footer rails
          slot: "#262920", // recessed wells (inputs, row troughs)
          rule: "#33372B", // painted hairline
        },
        // --- The lamps ---------------------------------------------------
        lamp: {
          DEFAULT: "#F2B233", // lit filament            9.78:1
          hot: "#FFD37A", // bloom on the active row
          dim: "#7A5C1F", // unlit element — decorative only, never text
        },
        // --- The tiles ---------------------------------------------------
        bone: {
          DEFAULT: "#E8E3D6", // tile face, primary text  14.33:1
          dim: "#9A9384", // secondary text            6.02:1
        },
        // --- Signals -----------------------------------------------------
        // Retuned off Tailwind's default emerald/red, which read as generic
        // and sit cold against the enamel.
        success: "#6FBF73", // gains                     8.20:1
        danger: "#E06A57", // losses                    5.57:1
        premium: "#D9A441", // Pro tier — brass, not gold-plated
        // `brand` stays the token name so 60-odd existing usages inherit the
        // world instead of needing a rename; it now means "lamp".
        brand: {
          DEFAULT: "#F2B233",
          dark: "#B8801E",
          light: "#FFD37A",
        },
        accent: "#F2B233",
        muted: "#9A9384", // 6.02:1 — was #74808f at 4.93:1
        // Tailwind's stock `slate` is a cool blue-grey and fights the enamel
        // everywhere it appears. Overriding the scale warms the entire
        // interior — tables, charts, panels — without editing those files.
        slate: {
          100: "#F2EEE3",
          200: "#E8E3D6", // 14.33:1
          300: "#CFC9B9", // 11.11:1
          400: "#9A9384", //  6.02:1
          500: "#7A7466",
          600: "#5C5749",
          700: "#403C31",
          800: "#2A2A21",
          900: "#1C1E15",
          950: "#14150F",
        },
        ink: {
          950: "#0D0E09",
          900: "#14150F",
          800: "#1C1E15",
          700: "#262920",
          600: "#33372B",
        },
      },
      boxShadow: {
        // Enamel has real depth. Rails sit proud of the chassis; slots are
        // milled into it. Both carry an offset and a soft blur.
        rail: "0 1px 0 rgba(232,227,214,0.05) inset, 0 6px 20px -12px rgba(0,0,0,0.9)",
        slot: "0 2px 6px rgba(0,0,0,0.55) inset, 0 -1px 0 rgba(232,227,214,0.04) inset",
        tile: "0 1px 0 rgba(232,227,214,0.06) inset, 0 2px 8px -4px rgba(0,0,0,0.8)",
        lamp: "0 0 24px -6px rgba(242,178,51,0.45)",
        soft: "0 1px 2px rgba(0,0,0,0.35)",
        elevated: "0 6px 20px -10px rgba(0,0,0,0.75)",
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
