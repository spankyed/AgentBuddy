// This window's app shell: the host's shell machine (`createShellMachine`, @abuddy/host/fe) composed with the
// window's I/O — the API client, the pack loader, localStorage, the toast and error page, and the window itself.
import { createPackFrontends, createShellMachine, type ShellNotify, type ShellStorage } from '@abuddy/host/fe';
import { feClient } from '@/core/fe-client';
import { fePacks } from '@/core/fe-packs';
import { globalToast } from '@/core/toast';
import { packFrontendIO } from '@/core/pack-frontend-io';

declare global {
  interface Window {
    /** Shows the error page index.html defines: an error's message over its stack, or a message */
    __showErrorPage?: (title: string, detail: string | { message: string; stack?: string }) => void;
  }
}

/** Where the panel sizes the user set are kept, so the next window opens with them */
const PANEL_SIZES_KEY = 'agentbuddy-panel-sizes';

const storage: ShellStorage = {
  loadPanelSizes: () => {
    const saved = localStorage.getItem(PANEL_SIZES_KEY);
    if (!saved) return undefined;
    try {
      return JSON.parse(saved);
    } catch {
      // A value that isn't JSON would otherwise fail the shell's creation, and the window with it: the defaults apply
      console.warn(`[app-shell] Ignoring unreadable panel sizes saved under ${PANEL_SIZES_KEY}`);
      return undefined;
    }
  },
  savePanelSizes: (sizes) => localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes)),
};

const notify: ShellNotify = {
  error: (title, detail) => globalToast.error(title, detail),
  errorPage: (title, detail) => window.__showErrorPage?.(title, detail),
};

const packFrontends = createPackFrontends(packFrontendIO, fePacks);

/** The app shell over this window's I/O; started by main.ts under `HOST.application` */
export function createAppShell() {
  return createShellMachine({ packs: fePacks, client: feClient, packFrontends, storage, notify, target: window });
}
