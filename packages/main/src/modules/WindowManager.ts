import type {AppModule} from '../AppModule.js';
import {ModuleContext} from '../ModuleContext.js';
import {BrowserWindow, ipcMain, app, dialog} from 'electron';
import type {AppInitConfig} from '../AppInitConfig.js';
import type {ApiServer} from './ApiServer.js';
import {join} from 'node:path';

class WindowManager implements AppModule {
  readonly #preload: {path: string};
  readonly #renderer: {path: string} | URL;
  readonly #openDevTools;
  readonly #apiServer?: ApiServer;

  constructor({initConfig, openDevTools = false, apiServer}: {initConfig: AppInitConfig, openDevTools?: boolean, apiServer?: ApiServer}) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
    this.#apiServer = apiServer;
  }

  async enable({app}: ModuleContext): Promise<void> {
    await app.whenReady();
    
    // Set dock icon for macOS in development
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = join(process.cwd(), 'buildResources', 'icon.png');
      app.dock.setIcon(iconPath);
    }
    
    // Set up window control handlers
    this.setupWindowControls();
    
    // Wait for API server to be ready before creating window
    if (this.#apiServer) {
      console.log('Waiting for API server to be ready before creating window...');
      await this.#apiServer.waitForReady();
      console.log('API server is ready, creating window...');
    }
    
    await this.restoreOrCreateWindow(true);
    app.on('second-instance', () => this.restoreOrCreateWindow(true));
    app.on('activate', () => this.restoreOrCreateWindow(true));
  }

  private setupWindowControls(): void {
    ipcMain.on('window:minimize', () => {
      const window = BrowserWindow.getFocusedWindow();
      window?.minimize();
    });

    ipcMain.on('window:maximize', () => {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    });

    ipcMain.on('window:close', () => {
      const window = BrowserWindow.getFocusedWindow();
      window?.close();
    });

    // Handle directory selection dialog
    ipcMain.handle('dialog:select-directory', async () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Select Directory'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    });
  }

  async createWindow(): Promise<BrowserWindow> {
    // Determine icon path based on platform
    const iconName = process.platform === 'win32' ? 'icon.ico' : 
                     process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    const iconPath = join(process.cwd(), 'buildResources', iconName);
    
    const browserWindow = new BrowserWindow({
      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      width: 1800,
      height: 1200,
      minWidth: 1200,
      minHeight: 800,
      icon: iconPath, // Set the window icon
      titleBarStyle: 'hiddenInset', // macOS: Hide title bar but keep traffic lights
      frame: process.platform !== 'darwin', // Windows/Linux: completely frameless
      transparent: false,
      vibrancy: 'under-window', // macOS: window vibrancy effect
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
      },
    });

    if (this.#renderer instanceof URL) {
      await browserWindow.loadURL(this.#renderer.href);
    } else {
      await browserWindow.loadFile(this.#renderer.path);
    }

    return browserWindow;
  }

  async restoreOrCreateWindow(show = false) {
    let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

    if (window === undefined) {
      window = await this.createWindow();
    }

    if (!show) {
      return window;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window?.show();

    if (this.#openDevTools) {
      window?.webContents.openDevTools();
    }

    window.focus();

    return window;
  }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
