import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { primary: "#0b0e11", secondary: "#111418", tertiary: "#1a1d23", card: "#141720" },
        accent: { green: "#00c853", red: "#ff3b3b", blue: "#3b8bff", yellow: "#ffd600", orange: "#ff9100" },
        text: { primary: "#e8eaed", secondary: "#8b8d93", muted: "#505258" },
        border: { DEFAULT: "#1e2128" },
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
