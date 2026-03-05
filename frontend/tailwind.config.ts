import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0a0f",
          secondary: "#0e0e14",
          tertiary: "#15151e",
          card: "#111118",
          hover: "#1a1a24",
          input: "#12121a",
        },
        accent: {
          green: "#00ff88",
          red: "#ff3860",
          blue: "#00d4ff",
          yellow: "#ffd000",
          orange: "#ff8c00",
          purple: "#b94fff",
          pink: "#ff2e97",
        },
        text: {
          primary: "#e4e4e8",
          secondary: "#7a7a8e",
          muted: "#44445a",
        },
        border: {
          DEFAULT: "#1a1a2e",
          bright: "#252540",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 255, 136, 0.15)",
        "glow-sm": "0 0 10px rgba(0, 255, 136, 0.1)",
        "glow-red": "0 0 20px rgba(255, 56, 96, 0.15)",
        "glow-blue": "0 0 20px rgba(0, 212, 255, 0.15)",
        "glow-purple": "0 0 20px rgba(185, 79, 255, 0.15)",
        neon: "0 0 5px rgba(0, 255, 136, 0.3), 0 0 20px rgba(0, 255, 136, 0.1)",
      },
      animation: {
        "pulse-green": "pulseGreen 2s ease-in-out infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
        shimmer: "shimmer 1.5s infinite",
        glow: "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        pulseGreen: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(0,255,136,0.2)" },
          "50%": { boxShadow: "0 0 20px rgba(0,255,136,0.4)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
