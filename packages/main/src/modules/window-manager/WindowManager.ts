import type {AppModule} from '../../AppModule.ts';
import {ModuleContext} from '../../ModuleContext.js';
import {BrowserWindow, ipcMain, app, dialog} from 'electron';
import type {AppInitConfig} from '../../AppInitConfig.ts';
import type {ApiServer} from '../api-server/ApiServer.ts';
import type {SplashScreen} from '../splash-screen/SplashScreen.ts';
import {join} from 'node:path';
import {WINDOW_CONFIG} from './constants.js';
import {SPLASH_CONFIG} from '../splash-screen/constants.js';
import fs from 'node:fs/promises';

class WindowManager implements AppModule {
  readonly #preload: {path: string};
  readonly #renderer: {path: string} | URL;
  readonly #openDevTools;
  readonly #apiServer?: ApiServer;
  readonly #splashScreen?: SplashScreen;

  constructor({initConfig, openDevTools = false, apiServer, splashScreen}: {
    initConfig: AppInitConfig, 
    openDevTools?: boolean, 
    apiServer?: ApiServer,
    splashScreen?: SplashScreen
  }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
    this.#apiServer = apiServer;
    this.#splashScreen = splashScreen;
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
    
    // Update splash screen status while waiting for API server
    if (this.#splashScreen) {
      this.#splashScreen.updateStatus('Waking Up Assistant');
    }
    
    // Wait for API server to be ready before creating window
    if (this.#apiServer) {
      try {
        await this.#apiServer.waitForReady();
      } catch (error) {
        console.error('[MAIN] API server failed to start:', error);
        
        // Update splash screen with error message
        if (this.#splashScreen) {
          this.#splashScreen.updateStatus('Failed to start API server. Please restart the application.');
        }
        
        // Wait a few seconds to show the error, then close
        await new Promise(resolve => setTimeout(resolve, WINDOW_CONFIG.ERROR_DISPLAY_TIME));
        
        // Close splash and exit
        if (this.#splashScreen) {
          await this.#splashScreen.close();
        }
        
        app.quit();
        return;
      }
    }
    
    // Update splash status
    if (this.#splashScreen && this.#splashScreen.isVisible()) {
      this.#splashScreen.updateStatus('Loading application...');
    }
    
    await this.restoreOrCreateWindow(true);
    app.on('second-instance', () => this.restoreOrCreateWindow(true));
    
    // On macOS, only create/restore window if there are no windows open
    app.on('activate', () => {
      // Check if there are any windows currently open
      if (BrowserWindow.getAllWindows().length === 0) {
        // No windows exist, create one
        this.restoreOrCreateWindow(true);
      } else {
        // Windows exist, just focus the main one
        const mainWindow = BrowserWindow.getAllWindows().find(w => 
          !w.isDestroyed() && this.isMainWindow(w)
        );
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
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

    // Handle file/directory selection dialog
    ipcMain.handle('dialog:select-path', async (event, options?: {
      allowMultiple?: boolean;
      type: 'file' | 'directory' | 'both';
    }) => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const type = options?.type || 'file';
      const properties: any[] = [];

      if (type === 'directory') {
        properties.push('openDirectory');
      } else if (type === 'file') {
        properties.push('openFile');
      } else {
        // 'both' - works on macOS, shows directory picker on Windows/Linux
        properties.push('openFile', 'openDirectory');
      }

      if (options?.allowMultiple) {
        properties.push('multiSelections');
      }

      const result = await dialog.showOpenDialog(window, {
        properties,
        title: type === 'directory' ? 'Select Directory' : 'Select File'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return options?.allowMultiple ? result.filePaths : result.filePaths[0];
    });

    // Handle file reading
    ipcMain.handle('file:read', async (event, filePath: string) => {
      return fs.readFile(filePath, 'utf-8');
    });
  }

  async createWindow(): Promise<BrowserWindow> {
    // Determine icon path based on platform
    const iconName = process.platform === 'win32' ? 'icon.ico' : 
                     process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    const iconPath = join(process.cwd(), 'buildResources', iconName);
    
    // Get the API port before creating the window
    const apiPort = this.#apiServer?.getStatus().port || 3001;
    console.log(`[MAIN] Creating window with API port: ${apiPort}`);
    
    const browserWindow = new BrowserWindow({
      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      width: WINDOW_CONFIG.WIDTH,
      height: WINDOW_CONFIG.HEIGHT,
      minWidth: WINDOW_CONFIG.MIN_WIDTH,
      minHeight: WINDOW_CONFIG.MIN_HEIGHT,
      title: WINDOW_CONFIG.MAIN_TITLE, // Used for window identification
      icon: iconPath, // Set the window icon
      titleBarStyle: 'hiddenInset', // macOS: Hide title bar but keep traffic lights
      frame: process.platform !== 'darwin', // Windows/Linux: completely frameless
      transparent: false,
      vibrancy: 'under-window', // macOS: window vibrancy effect
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.ts api
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
        additionalArguments: [`--api-port=${apiPort}`],
      },
    });

    try {
      if (this.#renderer instanceof URL) {
        await browserWindow.loadURL(this.#renderer.href);
      } else {
        await browserWindow.loadFile(this.#renderer.path);
      }
    } catch (error) {
      console.error('[MAIN] Failed to load renderer:', error);
      await this.closeSplashWithDelay();
      throw error;
    }

    return browserWindow;
  }

  private async closeSplashWithDelay(): Promise<void> {
    if (this.#splashScreen && this.#splashScreen.isVisible()) {
      setTimeout(async () => {
        await this.#splashScreen?.close();
      }, WINDOW_CONFIG.SPLASH_CLOSE_DELAY);
    }
  }

  private isMainWindow(window: BrowserWindow): boolean {
    // Use window title as identifier
    return window.getTitle() === WINDOW_CONFIG.MAIN_TITLE;
  }

  async restoreOrCreateWindow(show = false) {
    // Find main window using window tagging
    let window = BrowserWindow.getAllWindows().find(w => 
      !w.isDestroyed() && this.isMainWindow(w)
    );
    
    if (window === undefined) {
      window = await this.createWindow();
    }

    if (!show) {
      return window;
    }

    // Handle window visibility
    if (window.isMinimized()) {
      window.restore();
    }

    // Show the window
    window.show();
    
    if (this.#openDevTools) {
      window.webContents.openDevTools();
    }
    
    window.focus();
    
    // Close splash after main window is shown
    await this.closeSplashWithDelay();

    return window;
  }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
  return new WindowManager(...args);
}
