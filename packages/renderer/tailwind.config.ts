import path from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'tailwindcss';
import containerQueries from '@tailwindcss/container-queries';
import { uiTailwindPreset } from '@abuddy/ui/tailwind-preset';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(__dirname, '..');

/**
 * A pack's components are in this window's CSS only while the dev server serves them from source, and the
 * dev server is what says so: `vite.config.ts`'s `devPackFrontendsPlugin` writes the directories into
 * `ABUDDY_DEV_PACK_SOURCES`, and this reads them. **Nothing here infers an environment** — the variable is
 * absent in a built app rather than being deduced from one.
 *
 * A built app renders each pack's own bundle, whose `abuddy build` ran Tailwind over that pack's sources and
 * wrote `dist/runtime/fe.css`. Scanning them here as well would put a pack's classes in the app's
 * stylesheet twice, and — the reason it matters more than the duplication — it would make the app's build
 * read every pack's source, so `build:app` could no longer be cached on its own inputs.
 */
const devPackDirs = (process.env.ABUDDY_DEV_PACK_SOURCES ?? '').split(path.delimiter).filter(Boolean);

export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{vue,js,ts,jsx,tsx}'),
    path.join(packagesDir, 'abuddy-ui/src/**/*.{vue,js,ts,jsx,tsx}'),
    ...devPackDirs.map((dir) => path.join(dir, 'src/**/*.{vue,js,ts,jsx,tsx}')),
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
