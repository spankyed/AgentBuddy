import type {AppModule} from '../../AppModule.js';
import type {ModuleContext} from '../../ModuleContext.js';
import {BrowserWindow, ipcMain, app} from 'electron';
import {BrowserTabManager} from './BrowserTabManager.js';
import type {TabBounds} from './types.js';

class BrowserManager implements AppModule {
  #tabManager: BrowserTabManager | null = null;
  #downloadHandlerSet = false;

  enable(): void {
    this.#registerIpcHandlers();
  }

  #getTabManager(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserTabManager | null {
    if (!this.#tabManager) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;
      this.#tabManager = new BrowserTabManager(win);
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
    ipcMain.handle('browser:create-tab', (event, url?: string) => {
      return this.#getTabManager(event)?.createTab(url) ?? null;
    });

    ipcMain.handle('browser:close-tab', (event, tabId: number) => {
      this.#getTabManager(event)?.closeTab(tabId);
    });

    ipcMain.handle('browser:select-tab', (event, tabId: number) => {
      this.#getTabManager(event)?.selectTab(tabId);
    });

    // Navigation
    ipcMain.handle('browser:navigate', (event, tabId: number, url: string) => {
      this.#getTabManager(event)?.navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', (event, tabId: number) => {
      this.#getTabManager(event)?.goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', (event, tabId: number) => {
      this.#getTabManager(event)?.goForward(tabId);
    });

    ipcMain.handle('browser:reload', (event, tabId: number) => {
      this.#getTabManager(event)?.reload(tabId);
    });

    ipcMain.handle('browser:stop', (event, tabId: number) => {
      this.#getTabManager(event)?.stop(tabId);
    });

    // Bounds and visibility
    ipcMain.on('browser:set-bounds', (event, bounds: TabBounds) => {
      this.#getTabManager(event)?.setBounds(bounds);
    });

    ipcMain.on('browser:show', (event) => {
      this.#getTabManager(event)?.show();
    });

    ipcMain.on('browser:hide', (event) => {
      this.#getTabManager(event)?.hide();
    });

    // DevTools
    ipcMain.handle('browser:toggle-devtools', (event, tabId: number) => {
      this.#getTabManager(event)?.toggleDevTools(tabId);
    });

    // Query
    ipcMain.handle('browser:get-tabs', (event) => {
      return this.#getTabManager(event)?.getAllTabs() ?? [];
    });

    ipcMain.handle('browser:get-active-tab', (event) => {
      return this.#getTabManager(event)?.getActiveTabId() ?? null;
    });
  }
}

export function createBrowserModule(): BrowserManager {
  return new BrowserManager();
}
