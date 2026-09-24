/**
 * The Tailwind theme this package's components need, as a preset.
 *
 * Its components are Tailwind class names, and some of them name colours that only exist where a
 * Tailwind config defines them. The app defines those in `packages/renderer/tailwind.config.ts`, so
 * inside the app they resolve — but a pack that sets `fe.bundleUi` runs its own Tailwind build over
 * its own config, and nothing put the app's theme in it. The class names were scanned, no colour
 * matched, and Tailwind emitted nothing: the component rendered with its accent silently missing.
 *
 * So the theme travels with the components instead of living only in the app. The app applies this
 * preset and the FE bundler applies it to a `fe.bundleUi` pack's config, which makes one definition
 * serve both and keeps them from drifting.
 *
 * Keep this to what this package's own templates use — it is a floor for @abuddy/ui, not the app's
 * whole theme. `tests/build/fe-bundler-ui-theme.spec.ts` checks the classes here against the ones the
 * components actually name, so a new one fails until it is added.
 */
export const uiTailwindPreset = {
  theme: {
    extend: {
      colors: {
        primary: {
          400: '#4B96F3',
          500: '#2D7EE8',
          600: '#1E6FD9',
          700: '#1A5BB4',
        },
      },
    },
  },
};

export default uiTailwindPreset;
