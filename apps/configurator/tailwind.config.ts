import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui-kit/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter Variable", "-apple-system", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Cockpit dark tokens (gedefinieerd in styles.css :root als rauwe HSL-kanalen).
        // De `<alpha-value>`-vorm is nodig zodat Tailwind opacity-modifiers (bv.
        // bg-gauge-green/15) correct alpha injecteren i.p.v. ze te negeren.
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        "card-soft": "hsl(var(--card-soft) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-soft": "hsl(var(--border-soft) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        // Accenten
        brand: "hsl(var(--brand) / <alpha-value>)",
        "brand-bright": "hsl(var(--brand-bright) / <alpha-value>)",
        "gauge-green": "hsl(var(--gauge-green) / <alpha-value>)",
        "gauge-blue": "hsl(var(--gauge-blue) / <alpha-value>)",
        "gauge-red": "hsl(var(--gauge-red) / <alpha-value>)",
        // Legacy aliassen (zodat oude refs niet breken)
        primary: "hsl(var(--brand) / <alpha-value>)",
        ink: "hsl(var(--foreground) / <alpha-value>)",
      },
    },
  },
  plugins: [],
} satisfies Config;
