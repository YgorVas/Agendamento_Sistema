import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F1F5F0",
          100: "#E1EDDE",
          500: "#77B567",
          600: "#0E3604",
          700: "#092703",
        },
      },
    },
  },
  plugins: [],
};

export default config;
