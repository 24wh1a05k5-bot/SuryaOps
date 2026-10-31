/** Design tokens live as CSS variables in src/styles/index.css (light + dark). */
/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["'Inter Variable'", "Inter", "system-ui", "sans-serif"] },
      fontSize: {
        xs: ["12px", "16px"], sm: ["13px", "18px"], base: ["14px", "21px"], md: ["16px", "24px"],
        lg: ["20px", "28px"], xl: ["24px", "32px"], "2xl": ["30px", "36px"],
      },
      colors: {
        bg: v("bg"), surface: v("surface"), raised: v("raised"), sunken: v("sunken"),
        line: v("line"), "line-strong": v("line-strong"),
        ink: v("ink"), muted: v("muted"), faint: v("faint"),
        sun: { DEFAULT: v("sun"), strong: v("sun-strong"), soft: v("sun-soft"), ink: v("sun-ink") },
        cell: { DEFAULT: v("cell"), soft: v("cell-soft") },
        ok: { DEFAULT: v("ok"), soft: v("ok-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        bad: { DEFAULT: v("bad"), soft: v("bad-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
        side: { DEFAULT: v("side"), ink: v("side-ink"), muted: v("side-muted"), hover: v("side-hover") },
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "12px" },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.06), 0 0 0 1px rgb(var(--line) / 1)",
        pop: "0 12px 32px -8px rgb(var(--shadow) / 0.28), 0 0 0 1px rgb(var(--line) / 1)",
      },
      keyframes: {
        shake: { "0%,100%": { transform: "translateX(0)" }, "25%": { transform: "translateX(-6px)" }, "75%": { transform: "translateX(6px)" } },
        pop: { "0%": { transform: "scale(.96)", opacity: 0 }, "100%": { transform: "scale(1)", opacity: 1 } },
      },
      animation: { shake: "shake .25s ease-in-out 2", pop: "pop .16s ease-out" },
    },
  },
  plugins: [],
};
