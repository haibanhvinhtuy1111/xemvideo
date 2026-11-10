/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        sub: "var(--sub-surface)",
        border: "var(--border)",
        textMain: "var(--text-primary)",
        textSub: "var(--text-secondary)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)",
          light: "var(--primary-light)",
        },
        hot: {
          DEFAULT: "var(--accent-hot)",
          bg: "var(--accent-hot-bg)",
        },
        success: "var(--success)",
      },
    },
  },
  plugins: [],
};
