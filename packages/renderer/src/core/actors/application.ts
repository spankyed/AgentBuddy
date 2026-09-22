// This window's app shell: the host's shell machine (`createShellMachine`, @abuddy/host/fe) composed with the
// window's I/O — the API client, the pack loader, localStorage, the toast and error page, and the window itself.
import { createShellMachine, type ShellContext, type ShellEvent, type ShellNotify, type ShellPackFrontends, type ShellStorage } from '@abuddy/host/fe';
import { feClient } from '@/core/fe-client';
import { fePacks } from '@/core/fe-packs';
import { globalToast } from '@/core/toast';
import { loadPackFrontend, unloadPackFrontend } from '@/packs/pack-loader';

declare global {
  interface Window {
    /** Shows the error page index.html defines */
    __showErrorPage?: (title: string, detail: string) => void;
  }
}

export { visiblePluginsOf, withHostLast } from '@abuddy/host/fe';
export type ApplicationContext = ShellContext;
export type ApplicationEvent = ShellEvent;

/** Where the panel sizes the user set are kept, so the next window opens with them */
const PANEL_SIZES_KEY = 'agentbuddy-panel-sizes';

const storage: ShellStorage = {
  loadPanelSizes: () => {
    const saved = localStorage.getItem(PANEL_SIZES_KEY);
    return saved ? JSON.parse(saved) : undefined;
  },
  savePanelSizes: (sizes) => localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes)),
};

const notify: ShellNotify = {
  error: (title, detail) => globalToast.error(title, detail),
  errorPage: (title, detail) => window.__showErrorPage?.(title, detail),
};

const packFrontends: ShellPackFrontends = { load: loadPackFrontend, unload: unloadPackFrontend };

/** The app shell over this window's I/O; started by main.ts under `HOST.application` */
export function createAppShell() {
  return createShellMachine({ packs: fePacks, client: feClient, packFrontends, storage, notify, target: window });
}
