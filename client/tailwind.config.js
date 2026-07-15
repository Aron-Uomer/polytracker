/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // One restrained accent (indigo), used sparingly.
        brand: {
          DEFAULT: "#6366f1",
          dark: "#4f46e5",
          light: "#a5b4fc",
        },
        accent: "#818cf8",
        success: "#34d399", // gains
        danger: "#f87171", // losses
        premium: "#fbbf24", // Pro tier
        // Neutral dark surfaces
        ink: {
          950: "#0a0a0b",
          900: "#0f0f11",
          800: "#161618",
          700: "#1d1d20",
          600: "#26262a",
        },
      },
      boxShadow: {
        glow: "none",
        soft: "0 1px 2px rgba(0,0,0,0.25)",
        elevated: "0 4px 16px -8px rgba(0,0,0,0.5)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
