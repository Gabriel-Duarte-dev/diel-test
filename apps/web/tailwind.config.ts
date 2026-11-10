import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        diel: {
          navy: "#0f1868",
          ink: "#0a103f",
          cyan: "#00b5d8",
          line: "#d9e0ff",
          muted: "#7f8ab8",
        },
      },
      boxShadow: {
        panel: "0 16px 40px rgba(6, 20, 79, 0.10)",
      },
      fontFamily: {
        sans: ["Space Grotesk", "Segoe UI", "sans-serif"],
      },
      backgroundImage: {
        "diel-hero":
          "linear-gradient(-45deg, rgb(0, 0, 0), rgb(23, 25, 90), rgb(54, 59, 196))",

        "diel-shape-green":
          "url('/brand/polimorphic_shape_green.svg')",

        "diel-shape-light-blue":
          "url('/brand/polimorphic_shape_light_blue.svg')",
      },
      backgroundSize: {
        "hero-size": "150% 150%",
      },
      backgroundPosition: {
        "hero-position": "0% 0%",
      },
      keyframes: {
        "diel-gradient": {
          "0%": {
            backgroundPosition: "10% 95%",
          },
          "50%": {
            backgroundPosition: "100% 95%",
          },
          "100%": {
            backgroundPosition: "10% 95%",
          },
        },

        "diel-shape-green": {
          "0%": {
            transform: "translate(40%, 0%) rotate(0deg)",
          },
          "50%": {
            transform: "translate(60%, -18%) rotate(140deg)",
          },
          "100%": {
            transform: "translate(70%, -37.2%) rotate(275deg)",
          },
        },

        "diel-shape-light-blue": {
          "0%": {
            transform: "translate(0%, 0%) rotate(0deg)",
          },
          "50%": {
            transform: "translate(7%, -4%) rotate(45deg)",
          },
          "100%": {
            transform: "translate(14.75%, -14.75%) rotate(92.78deg)",
          },
        },
      },
      animation: {
        "diel-gradient":
          "diel-gradient 30s ease infinite",

        "diel-shape-green":
          "diel-shape-green 15s linear infinite alternate",

        "diel-shape-light-blue":
          "diel-shape-light-blue 15s linear infinite alternate",
      },
    },
  },
  plugins: [],
} satisfies Config;
