// This window's half of loading a pack's frontend: importing a module from `pack://` and putting a stylesheet in the
// document. The rules around both — which URL, what counts as a registration, what unloading undoes — are the host's
// (`@apack/host/fe`, `fe/packs/frontends.ts`), which takes this as its I/O.
import type { PackFrontendIO } from '@apack/host/fe';
import devFrontends from 'virtual:dev-pack-frontends';

export const packFrontendIO: PackFrontendIO = {
  importModule: (url) => import(/* @vite-ignore */ url),

  // The packs this dev server serves from source. Empty in a built app, where every pack's frontend is
  // fetched over `pack://` from the bundle its own build wrote
  devFrontends,

  styles: {
    // A pack whose frontend is only styles reports no plugins, so a later load reaches it again; its stylesheet is
    // already here, and deactivating the pack removes it
    add: (packId, href) => document.querySelector(`link[data-pack-id="${packId}"][href="${href}"]`)
      ? Promise.resolve()
      : new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.packId = packId;
        link.onload = () => resolve();
        link.onerror = () => {
          console.warn(`[pack-loader] Failed to load styles for pack ${packId}`);
          resolve();
        };
        document.head.appendChild(link);
      }),

    remove: (packId) => document.querySelectorAll(`link[data-pack-id="${packId}"]`).forEach(el => el.remove()),
  },
};
