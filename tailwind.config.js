/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["docs/**/*.{html, js}"],
  theme: {
    extend: {
      keyframes: {
        nudge: {
          "0%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(3px, 3px)" },
          "50%": { transform: "translate(-3px, 5px)" },
          "75%": { transform: "translate(5px, 8px)" },
          "100%": { transform: "translate(0, 0)" },
        },
      },
      animation: {
        nudge: "nudge 0.3s ease-out infinite",
      },
      backgroundImage: {
        xp: "url('../images/winxp.jpg')",
      },
    },
  },
  plugins: [],
};
