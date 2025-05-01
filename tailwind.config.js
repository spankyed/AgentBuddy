/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          400: '#4B96F3',  // Lighter shade for hover/focus
          500: '#2D7EE8',  // Base color matching the reference
          600: '#1E6FD9',  // Darker shade for active/pressed
        }
      }
    }
  },
  plugins: [],
};