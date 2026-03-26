/** PostCSS config — CommonJS so cloud builds (e.g. Vercel) reliably resolve Tailwind. */
module.exports = {
  plugins: {
    tailwindcss: require('tailwindcss'),
    autoprefixer: require('autoprefixer'),
  },
};
