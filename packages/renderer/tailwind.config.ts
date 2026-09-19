import path from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'tailwindcss';
import containerQueries from '@tailwindcss/container-queries';
import { discoverBuiltInPacksForBuild } from '@abuddy/host/build/discover';
import { uiTailwindPreset } from '@abuddy/ui/tailwind-preset';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(__dirname, '..');

const builtInPacks = discoverBuiltInPacksForBuild(packagesDir);

export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{vue,js,ts,jsx,tsx}'),
    path.join(packagesDir, 'abuddy-ui/src/**/*.{vue,js,ts,jsx,tsx}'),
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
  // @abuddy/ui's components name primary-*, so its theme comes from the package rather than being
  // repeated here — a pack that bundles @abuddy/ui applies the same preset
  presets: [uiTailwindPreset],
  theme: {
    extend: {
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
