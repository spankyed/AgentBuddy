// This window's half of loading a pack's frontend: importing a module from `pack://` and putting a stylesheet in the
// document. The rules around both — which URL, what counts as a registration, what unloading undoes — are the host's
// (`@apackdev/host/fe`, `fe/packs/frontends.ts`), which takes this as its I/O.
import type { PackFrontendIO } from '@apackdev/host/fe';
import devFrontends from 'virtual:dev-pack-frontends';
import { settingsForPack } from '@/runtime/settings';

const styleLoads = new WeakMap<HTMLLinkElement, { promise: Promise<void>; cancel: () => void }>();

export const packFrontendIO: PackFrontendIO = {
  settingsForPack,
  importModule: (url) => import(/* @vite-ignore */ url),

  // The packs this dev server serves from source. Empty in a built app, where every pack's frontend is
  // fetched over `pack://` from the bundle its own build wrote
  devFrontends,

  styles: {
    // A pack whose frontend is only styles reports no plugins, so a later load reaches it again; its stylesheet is
    // already here, and deactivating the pack removes it
    add: (packId, href) => {
      const existing = document.querySelector<HTMLLinkElement>(`link[data-pack-id="${packId}"][href="${href}"]`);
      if (existing) return styleLoads.get(existing)?.promise ?? Promise.reject(new Error(`Untracked styles for pack "${packId}"`));
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.packId = packId;
      let cancel!: () => void;
      const promise = new Promise<void>((resolve, reject) => {
        cancel = () => reject(new Error(`Styles for pack "${packId}" were unloaded before loading`));
        link.onload = () => resolve();
        link.onerror = () => {
          link.remove();
          reject(new Error(`Failed to load styles for pack "${packId}"`));
        };
      });
      styleLoads.set(link, { promise, cancel });
      document.head.appendChild(link);
      return promise;
    },

    remove: (packId) => document.querySelectorAll<HTMLLinkElement>(`link[data-pack-id="${packId}"]`).forEach(link => {
      styleLoads.get(link)?.cancel();
      link.remove();
    }),
  },
};
