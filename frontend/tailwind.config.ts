import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { primary: "#05080f", secondary: "#0b1120", tertiary: "#131b2e" },
        accent: { green: "#00ff88", red: "#ff3358", blue: "#3b8bff", yellow: "#ffca28" },
        text: { primary: "#eef0f4", secondary: "#8a94a6", muted: "#525c6e" },
        border: { DEFAULT: "#1a2235" },
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
