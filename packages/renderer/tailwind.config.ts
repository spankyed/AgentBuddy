import path from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'tailwindcss';
import containerQueries from '@tailwindcss/container-queries';
import { discoverBuiltInPacksForBuild } from '@abuddy/sdk/build';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(__dirname, '..');

const builtInPacks = discoverBuiltInPacksForBuild(packagesDir);

export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{vue,js,ts,jsx,tsx}'),
    path.join(packagesDir, 'abuddy-sdk/src/fe/**/*.{vue,js,ts,jsx,tsx}'),
    ...builtInPacks.map(p => path.join(p.srcDir, '**/*.{vue,js,ts,jsx,tsx}')),
  ],
  safelist: [
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
          400: '#4B96F3',
          500: '#2D7EE8',
          600: '#1E6FD9',
          700: '#1A5BB4',
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
    containerQueries,
  ],
} satisfies Config;
