import type {AppModule} from '../../AppModule.js';
import {BrowserWindow, ipcMain, session} from 'electron';
import {BrowserTabManager} from './BrowserTabManager.js';
import type {TabBounds} from './types.js';

class BrowserManager implements AppModule {
  #tabManager: BrowserTabManager | null = null;

  enable(): void {
    this.#registerIpcHandlers();
  }

  #getTabManager(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserTabManager | null {
    if (!this.#tabManager) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;
      this.#tabManager = new BrowserTabManager(win);
    }
    return this.#tabManager;
  }

  #registerIpcHandlers(): void {
    // Queries (handle — return data)
    ipcMain.handle('browser:create-tab', (event, url?: string, options?: { lazy?: boolean; title?: string; favicon?: string; activate?: boolean; persistedId?: string }) => {
      return this.#getTabManager(event)?.createTab(url, options) ?? null;
    });

    ipcMain.handle('browser:load-tab', (event, tabId: number) => {
      this.#getTabManager(event)?.loadTab(tabId);
    });

    ipcMain.handle('browser:get-tabs', (event) => {
      return this.#getTabManager(event)?.getAllTabs() ?? [];
    });

    ipcMain.handle('browser:get-active-tab', (event) => {
      return this.#getTabManager(event)?.getActiveTabId() ?? null;
    });

    // Fire-and-forget mutations
    ipcMain.on('browser:close-tab', (event, tabId: number) => {
      this.#getTabManager(event)?.closeTab(tabId);
    });

    ipcMain.on('browser:select-tab', (event, tabId: number) => {
      this.#getTabManager(event)?.selectTab(tabId);
    });

    ipcMain.on('browser:navigate', (event, tabId: number, url: string) => {
      this.#getTabManager(event)?.navigate(tabId, url);
    });

    ipcMain.on('browser:go-back', (event, tabId: number) => {
      this.#getTabManager(event)?.goBack(tabId);
    });

    ipcMain.on('browser:go-forward', (event, tabId: number) => {
      this.#getTabManager(event)?.goForward(tabId);
    });

    ipcMain.on('browser:reload', (event, tabId: number) => {
      this.#getTabManager(event)?.reload(tabId);
    });

    ipcMain.on('browser:stop', (event, tabId: number) => {
      this.#getTabManager(event)?.stop(tabId);
    });

    ipcMain.on('browser:set-bounds', (event, bounds: TabBounds) => {
      this.#getTabManager(event)?.setBounds(bounds);
    });

    ipcMain.on('browser:show', (event) => {
      this.#getTabManager(event)?.show();
    });

    ipcMain.on('browser:hide', (event) => {
      this.#getTabManager(event)?.hide();
    });

    ipcMain.on('browser:toggle-devtools', (event, tabId: number) => {
      this.#getTabManager(event)?.toggleDevTools(tabId);
    });

    // Tab actions
    ipcMain.handle('browser:duplicate-tab', (event, tabId: number) => {
      return this.#getTabManager(event)?.duplicateTab(tabId) ?? null;
    });

    ipcMain.handle('browser:set-tab-muted', (event, tabId: number, muted: boolean) => {
      this.#getTabManager(event)?.setTabMuted(tabId, muted);
    });

    ipcMain.handle('browser:clear-cache', () => {
      return session.fromPartition('persist:browser').clearStorageData();
    });
  }
}

export function createBrowserModule(): BrowserManager {
  return new BrowserManager();
}
