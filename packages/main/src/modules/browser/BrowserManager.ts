import type {AppModule} from '../../AppModule.js';
import type {ModuleContext} from '../../ModuleContext.js';
import {ipcMain, app} from 'electron';
import {BrowserTabManager} from './BrowserTabManager.js';
import type {TabBounds} from './types.js';

class BrowserManager implements AppModule {
  #tabManager: BrowserTabManager | null = null;
  #downloadHandlerSet = false;

  enable(): void {
    this.#registerIpcHandlers();
  }

  #getTabManager(): BrowserTabManager {
    if (!this.#tabManager) {
      this.#tabManager = new BrowserTabManager();
      this.#ensureDownloadHandler();
    }
    return this.#tabManager;
  }

  #ensureDownloadHandler(): void {
    if (this.#downloadHandlerSet || !this.#tabManager) return;
    this.#downloadHandlerSet = true;

    this.#tabManager.session.on('will-download', (_event, item) => {
      const fileName = item.getFilename();

      // Default behavior: Electron prompts the user for save location
      // when no savePath is explicitly set.

      item.once('done', (_e, state) => {
        if (state === 'completed') {
          console.log(`[Browser] Download complete: ${fileName}`);
        } else {
          console.log(`[Browser] Download ${state}: ${fileName}`);
        }
      });
    });
  }

  #registerIpcHandlers(): void {
    // Tab management
    ipcMain.handle('browser:create-tab', (_event, url?: string) => {
      return this.#getTabManager().createTab(url);
    });

    ipcMain.handle('browser:close-tab', (_event, tabId: number) => {
      this.#getTabManager().closeTab(tabId);
    });

    ipcMain.handle('browser:select-tab', (_event, tabId: number) => {
      this.#getTabManager().selectTab(tabId);
    });

    // Navigation
    ipcMain.handle('browser:navigate', (_event, tabId: number, url: string) => {
      this.#getTabManager().navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', (_event, tabId: number) => {
      this.#getTabManager().goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', (_event, tabId: number) => {
      this.#getTabManager().goForward(tabId);
    });

    ipcMain.handle('browser:reload', (_event, tabId: number) => {
      this.#getTabManager().reload(tabId);
    });

    ipcMain.handle('browser:stop', (_event, tabId: number) => {
      this.#getTabManager().stop(tabId);
    });

    // Bounds and visibility
    ipcMain.on('browser:set-bounds', (_event, bounds: TabBounds) => {
      this.#getTabManager().setBounds(bounds);
    });

    ipcMain.on('browser:show', () => {
      this.#getTabManager().show();
    });

    ipcMain.on('browser:hide', () => {
      this.#getTabManager().hide();
    });

    // Query
    ipcMain.handle('browser:get-tabs', () => {
      return this.#getTabManager().getAllTabs();
    });

    ipcMain.handle('browser:get-active-tab', () => {
      return this.#getTabManager().getActiveTabId();
    });
  }
}

export function createBrowserModule(): BrowserManager {
  return new BrowserManager();
}
