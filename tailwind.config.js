/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0b0c',
          panel: '#141416',
          subtle: '#1c1c20',
        },
        fg: {
          DEFAULT: '#f4f4f5',
          muted: '#a1a1aa',
        },
        border: '#2a2a30',
        accent: {
          DEFAULT: '#7c5cff',
          fg: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};
