import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#2563eb",
        danger: "#dc2626",
        success: "#16a34a",
      },
    },
  },
  plugins: [],
} satisfies Config;
