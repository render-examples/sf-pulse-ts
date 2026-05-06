/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/components/diagram/**/*.{ts,tsx,astro}',
    './src/pages/diagram.astro',
    './node_modules/workflow-visualizer/src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
