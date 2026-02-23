import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { primary: "#0a0e17", secondary: "#111827", tertiary: "#1f2937" },
        accent: { green: "#00e676", red: "#ff1744", blue: "#2979ff", yellow: "#ffc107" },
        text: { primary: "#f3f4f6", secondary: "#9ca3af", muted: "#6b7280" },
        border: { DEFAULT: "#374151" },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
