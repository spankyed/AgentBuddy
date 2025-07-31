import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { startBackendServer } from './backend/server';
import { setupIpcHandlers } from './ipc/handlers';
import { createApplicationMenu } from './menu';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  // Ignore if not installed
}
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let backendPort: number | null = null;

const createWindow = async () => {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'AgentBuddy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Add right-click context menu with dev tools option
  mainWindow.webContents.on('context-menu', (e, params) => {
    const { Menu, MenuItem } = require('electron');
    const menu = new Menu();
    
    // Add dev tools option
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => {
        mainWindow?.webContents.inspectElement(params.x, params.y);
      }
    }));
    
    menu.popup();
  });

  // Start backend server
  backendPort = await startBackendServer();
  
  // Pass backend port to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('backend-port', backendPort);
  });

  // Load the app
  if (isDev) {
    // In development, try to load from Vite dev server
    try {
      await mainWindow.loadURL('http://localhost:5173');
    } catch (error) {
      console.log('Dev server not running, loading built files instead');
      // Fall back to built files if dev server isn't running
      const electronBuildPath = path.join(__dirname, '../../web/dist-electron/index-electron.html');
      const regularBuildPath = path.join(__dirname, '../../web/dist/index.html');
      
      try {
        await mainWindow.loadFile(electronBuildPath);
      } catch (e) {
        console.log('Electron build not found, trying regular build');
        await mainWindow.loadFile(regularBuildPath);
      }
    }
    // Always open dev tools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    await mainWindow.loadFile(path.join(__dirname, '../../web/dist-electron/index-electron.html'));
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Setup IPC handlers
setupIpcHandlers(ipcMain);

// App event handlers
app.whenReady().then(() => {
  createApplicationMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});