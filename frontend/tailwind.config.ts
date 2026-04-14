import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#050607",
          secondary: "#0a0b0e",
          tertiary: "#111318",
          card: "rgba(12,14,18,0.70)",
          hover: "rgba(255,255,255,0.05)",
          input: "#0a0b0e",
        },
        accent: {
          green: "#39FF14",
          red: "#ff3860",
          blue: "#4fc3f7",
          orange: "#ffb347",
          yellow: "#ffd700",
        },
        text: {
          primary: "#e8e8f0",
          secondary: "#b0b0c8",
          muted: "#5c5c80",
        },
        border: "rgba(255,255,255,0.10)",
        surface: "#0c0e12",
        neon: {
          green: "#39FF14",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(57, 255, 20, 0.15), 0 0 60px rgba(57, 255, 20, 0.05)",
        "glow-sm": "0 0 10px rgba(57, 255, 20, 0.1)",
        "glow-strong": "0 0 30px rgba(57, 255, 20, 0.25), 0 0 80px rgba(57, 255, 20, 0.08)",
        "neon": "0 0 18px rgba(57, 255, 20, 0.10)",
      },
      keyframes: {
        "token-enter": {
          "0%": { opacity: "0", transform: "translateY(-8px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "price-flash-green": {
          "0%": { backgroundColor: "rgba(57, 255, 20, 0.15)" },
          "100%": { backgroundColor: "transparent" },
        },
        "price-flash-red": {
          "0%": { backgroundColor: "rgba(255, 56, 96, 0.15)" },
          "100%": { backgroundColor: "transparent" },
        },
        "page-enter": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "token-enter": "token-enter 0.2s ease-out",
        "price-flash-green": "price-flash-green 0.8s ease-out",
        "price-flash-red": "price-flash-red 0.8s ease-out",
        "page-enter": "page-enter 0.15s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
