import type {AppModule} from '../../AppModule.ts';
import {ModuleContext} from '../../ModuleContext.js';
import {BrowserWindow, ipcMain, app, dialog, shell} from 'electron';
import type {AppInitConfig} from '../../AppInitConfig.ts';
import type {ApiServer} from '../api-server/ApiServer.ts';
import type {SplashScreen} from '../splash-screen/SplashScreen.ts';
import {join} from 'node:path';
import {WINDOW_CONFIG} from './constants.js';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import {getMediaBasePath} from '../media-protocol/paths.js';

class WindowManager implements AppModule {
  readonly #preload: {path: string};
  readonly #renderer: {path: string} | URL;
  readonly #openDevTools;
  readonly #apiServer?: ApiServer;
  readonly #splashScreen?: SplashScreen;
  readonly #demoCapture?: AppInitConfig['demoCapture'];

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
    this.#demoCapture = initConfig.demoCapture;
  }

  async enable({app}: ModuleContext): Promise<void> {
    await app.whenReady();
    
    // Set dock icon for macOS in development (production uses bundled icon from Info.plist)
    if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
      const iconPath = join(process.cwd(), 'build', 'resources', 'icon-dev.png');
      app.dock.setIcon(iconPath);
    }
    
    // Set up window control handlers
    this.setupWindowControls();
    
    // Update splash screen status while waiting for API server
    if (this.#splashScreen) {
      // this.#splashScreen.updateStatus('Waking Up Assistant');
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

        // Show dialog so user can retry or quit
        const { response } = await dialog.showMessageBox({
          type: 'error',
          title: 'Startup Error',
          message: 'Failed to start API server',
          detail: (error as Error)?.message || 'The backend process could not start. You can relaunch to try again.',
          buttons: ['Relaunch', 'Quit'],
          defaultId: 0,
        });

        if (this.#splashScreen) {
          await this.#splashScreen.close();
        }

        if (response === 0) {
          app.relaunch();
        }
        app.exit(0);
        return;
      }
    }
    
    // Update splash status
    if (this.#splashScreen && this.#splashScreen.isVisible()) {
      // this.#splashScreen.updateStatus('Loading...');
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

    ipcMain.on('zoom:changed', (event, zoomFactor: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const y = Math.round((42 * zoomFactor - 12) / 2);
        win.setWindowButtonPosition({x: 10, y});
      }
    });

    // Handle directory selection dialog
    ipcMain.handle('dialog:select-directory', async () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Select Directory',
        defaultPath: app.getPath('home'),
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
        title: type === 'directory' ? 'Select Directory' : 'Select File',
        defaultPath: app.getPath('home'),
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

    // Handle file reading as base64 (for binary files like images)
    ipcMain.handle('file:read-base64', async (event, filePath: string) => {
      const buffer = await fs.readFile(filePath);
      return buffer.toString('base64');
    });

    // Handle opening external URLs in default browser
    ipcMain.handle('shell:openExternal', async (_event, url: string) => {
      if (/^https?:\/\//.test(url)) {
        await shell.openExternal(url);
      }
    });

    // Handle revealing files in OS file explorer
    ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
      shell.showItemInFolder(filePath);
    });

    // Handle opening files with the OS default application
    ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
      const result = await shell.openPath(filePath);
      if (result) throw new Error(result);
    });

    // Handle opening an image in the default image app
    ipcMain.handle('shell:openImageExternal', async (_event, url: string) => {
      const mimeToExt: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
      };

      let buffer: Buffer;
      let ext = '.png';

      if (url.startsWith('data:')) {
        const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (!match) throw new Error('Invalid data URL');
        ext = mimeToExt[match[1]] || '.png';
        buffer = Buffer.from(match[2], 'base64');
      } else {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type') || '';
        ext = mimeToExt[contentType] || '.png';
        buffer = Buffer.from(await response.arrayBuffer());
      }

      const tmpPath = join(os.tmpdir(), `agentbuddy-${crypto.randomUUID()}${ext}`);
      await fs.writeFile(tmpPath, buffer);
      await shell.openPath(tmpPath);
    });

    // Media upload handler
    ipcMain.handle('media:upload', async (_event, entityId: string, base64Data: string, mimeType: string) => {
      // Validate entityId and mimeType
      if (!entityId || entityId.includes('..') || entityId.includes('/') || entityId.includes('\\')) {
        throw new Error('Invalid entityId');
      }

      const allowedTypes: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };

      const ext = allowedTypes[mimeType];
      if (!ext) {
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error('Image exceeds 10MB limit');
      }

      const filename = `${crypto.randomUUID()}.${ext}`;
      const dir = join(getMediaBasePath(), entityId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, filename), buffer);

      return `media://${entityId}/${filename}`;
    });

    // Media delete handler
    ipcMain.handle('media:delete', async (_event, entityId: string, filename: string) => {
      if (!entityId || !filename || entityId.includes('..') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid path');
      }
      const filePath = join(getMediaBasePath(), entityId, filename);
      await fs.unlink(filePath).catch(() => {});
    });

    // Media delete-all handler
    ipcMain.handle('media:delete-all', async (_event, entityId: string) => {
      if (!entityId || entityId.includes('..') || entityId.includes('/') || entityId.includes('\\')) {
        throw new Error('Invalid entityId');
      }
      const dir = join(getMediaBasePath(), entityId);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    });
  }

  async createWindow(): Promise<BrowserWindow> {
    // Determine icon path based on platform (use dev icon in development)
    const iconSuffix = app.isPackaged ? '' : '-dev';
    const iconName = process.platform === 'win32' ? `icon${iconSuffix}.ico` :
                     process.platform === 'darwin' ? `icon${iconSuffix}.icns` : `icon${iconSuffix}.png`;
    const iconPath = join(process.cwd(), 'build', 'resources', iconName);
    
    // Get the API port before creating the window
    const apiPort = this.#apiServer?.getStatus().port || 3001;
    console.log(`[MAIN] Creating window with API port: ${apiPort}`);
    const isDemoCapture = this.#demoCapture?.enabled === true;
    const additionalArguments = [`--api-port=${apiPort}`];

    if (isDemoCapture) {
      additionalArguments.push(
        '--demo-enabled=true',
        `--demo-id=${this.#demoCapture!.id}`,
        `--demo-scene=${this.#demoCapture!.scene}`,
      );
    }
    
    const browserWindow = new BrowserWindow({
      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      width: isDemoCapture ? WINDOW_CONFIG.DEMO_WIDTH : WINDOW_CONFIG.WIDTH,
      height: isDemoCapture ? WINDOW_CONFIG.DEMO_HEIGHT : WINDOW_CONFIG.HEIGHT,
      minWidth: isDemoCapture ? WINDOW_CONFIG.DEMO_WIDTH : WINDOW_CONFIG.MIN_WIDTH,
      minHeight: isDemoCapture ? WINDOW_CONFIG.DEMO_HEIGHT : WINDOW_CONFIG.MIN_HEIGHT,
      center: true,
      title: WINDOW_CONFIG.MAIN_TITLE, // Used for window identification
      icon: iconPath, // Set the window icon
      titleBarStyle: isDemoCapture ? 'hidden' : (process.platform === 'darwin' ? 'hiddenInset' : 'hidden'),
      ...(process.platform === 'darwin' && !isDemoCapture ? { trafficLightPosition: {x: 10, y: 15} } : {}),
      frame: false, // All platforms: frameless with custom window controls
      transparent: false,
      backgroundColor: '#111111',
      ...(isDemoCapture ? {} : {vibrancy: 'under-window' as const}), // macOS: window vibrancy effect
      resizable: !isDemoCapture,
      maximizable: !isDemoCapture,
      fullscreenable: !isDemoCapture,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.ts api
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
        additionalArguments,
      },
    });

    if (isDemoCapture) {
      browserWindow.webContents.setZoomFactor(1);
    }

    if (!isDemoCapture) {
      const {default: contextMenu} = await import('electron-context-menu');
      contextMenu({ window: browserWindow });
    }

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
