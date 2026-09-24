// Where this window keeps what the shell saves: the panel sizes the user set, so the next window opens with them.
import type { ShellStorage } from '@abuddy/host/fe';

const PANEL_SIZES_KEY = 'agentbuddy-panel-sizes';

export const windowStorage: ShellStorage = {
  loadPanelSizes: () => {
    const saved = localStorage.getItem(PANEL_SIZES_KEY);
    if (!saved) return undefined;
    try {
      return JSON.parse(saved);
    } catch {
      // A value that isn't JSON would otherwise fail the shell's creation, and the window with it: the defaults apply
      console.warn(`[storage] Ignoring unreadable panel sizes saved under ${PANEL_SIZES_KEY}`);
      return undefined;
    }
  },

  savePanelSizes: (sizes) => localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes)),
};
