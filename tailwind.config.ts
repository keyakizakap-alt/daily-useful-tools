import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9f4",
          100: "#dcf0e3",
          500: "#2f9e6b",
          600: "#268a5c",
          700: "#1f6e4a",
        },
        ink: {
          900: "#1f2328",
          700: "#3a3f45",
          500: "#5c636b",
          300: "#9aa1a9",
        },
        paper: "#fbfbfa",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Hiragino Sans", "Noto Sans JP", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
