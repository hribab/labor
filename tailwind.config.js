/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        mist: "#f7f7f5",
        line: "#e6e4df",
        brand: "#0f766e",
      },
      boxShadow: {
        composer: "0 14px 45px rgba(18, 18, 18, 0.08)",
      },
    },
  },
  plugins: [],
};
