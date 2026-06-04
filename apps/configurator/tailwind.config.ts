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
        primary: "#7AB829",
        "primary-hover": "#6BA31F",
        "primary-tint": "#F2F8E8",
        ink: "#3F3F3F",
        heading: "#1A1A1A",
        canvas: "#F7F8F6",
        border: "#E5E7E0",
        sidebar: "#FAFBF8",
      },
      boxShadow: {
        sidebar: "-1px 0 0 #E5E7E0",
      },
    },
  },
  plugins: [],
} satisfies Config;
