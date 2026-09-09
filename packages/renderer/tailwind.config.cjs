const path = require('path');
const fs = require('fs');

const packagesDir = path.join(__dirname, '..');

function discoverBuiltInPackContentPaths() {
  const paths = [];
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (m.builtIn && m.id) {
        paths.push(path.join(packagesDir, entry.name, 'src/**/*.{vue,js,ts,jsx,tsx}'));
      }
    } catch {}
  }
  return paths;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{vue,js,ts,jsx,tsx}'),
    path.join(packagesDir, 'abuddy-sdk/src/fe/**/*.{vue,js,ts,jsx,tsx}'),
    ...discoverBuiltInPackContentPaths(),
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
      },
      keyframes: {
        'slide-down': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-10px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          }
        }
      },
      animation: {
        'slide-down': 'slide-down 0.2s ease-out'
      },
      height: {
        header: '42px',
      }
    }
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
}
