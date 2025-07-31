import { IpcMain, app, dialog, shell, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';

export function setupIpcHandlers(ipcMain: IpcMain) {
  // Backend port handler
  let backendPort: number | null = null;

  ipcMain.handle('get-backend-port', () => backendPort);

  // Set backend port (called from main process)
  ipcMain.handle('set-backend-port', (_event, port: number) => {
    backendPort = port;
  });

  // File system operations
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('select-file', async (_event, options) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options?.filters || [],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  });

  // App info
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-platform', () => process.platform);

  // Window controls
  ipcMain.handle('minimize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    window?.minimize();
  });

  ipcMain.handle('maximize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window?.isMaximized()) {
      window.unmaximize();
    } else {
      window?.maximize();
    }
  });

  ipcMain.handle('close-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    window?.close();
  });

  // Shell operations
  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('show-item-in-folder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}