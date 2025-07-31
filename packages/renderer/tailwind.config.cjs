const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{vue,js,ts,jsx,tsx}'),
    // Also scan for test file
    path.join(__dirname, './src/test-tailwind.vue'),
  ],
  safelist: [
    // Ensure these classes are always generated for testing
    'bg-red-500',
    'text-white', 
    'p-4',
    'hidden',
    'bg-neutral-900',
    'text-neutral-100',
    'block'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          400: '#4B96F3',  // Lighter shade for hover/focus
          500: '#2D7EE8',  // Base color matching the reference
          600: '#1E6FD9',  // Darker shade for active/pressed
          700: '#1A5BB4',  // Even darker shade for disabled
        }
      }
    }
  },
  plugins: [],
}