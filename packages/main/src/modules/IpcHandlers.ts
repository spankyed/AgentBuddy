import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { 
  User, 
  UserPreferences, 
  AppConfig, 
  FileInfo,
  ApiResponse,
  IpcChannel,
  IpcRequests,
  IpcResponses 
} from '@app/shared';
import { IPC_CHANNELS, APP_EVENTS } from '@app/shared';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';

// Mock user data for demonstration
const mockUser: User = {
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date(),
  preferences: {
    theme: 'system',
    language: 'en',
    notifications: true
  }
};

// Helper to create typed API responses
function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function error(code: string, message: string, details?: any): ApiResponse {
  return { success: false, error: { code, message, details } };
}

export class IpcHandlers implements AppModule {
  enable(context: ModuleContext): void {
    const { app } = context;
    
    // Type-safe IPC handler registration
    const handle = <T extends IpcChannel>(
      channel: T,
      handler: (
        event: Electron.IpcMainInvokeEvent,
        ...args: IpcRequests[T] extends void ? [] : [IpcRequests[T]]
      ) => Promise<ApiResponse<IpcResponses[T]>>
    ) => {
      ipcMain.handle(channel, handler);
    };
    
    // User operations
    handle(IPC_CHANNELS.GET_USER, async (event, { userId }) => {
      // In a real app, fetch from database
      if (userId === 'current' || userId === mockUser.id) {
        return success(mockUser);
      }
      return error('USER_NOT_FOUND', `User ${userId} not found`);
    });
    
    handle(IPC_CHANNELS.UPDATE_USER, async (event, { userId, updates }) => {
      // In a real app, update database
      Object.assign(mockUser, updates);
      return success(mockUser);
    });
    
    handle(IPC_CHANNELS.UPDATE_PREFERENCES, async (event, preferences) => {
      // Update preferences and notify all windows
      mockUser.preferences = preferences;
      
      // Broadcast preference change to all windows
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send(APP_EVENTS.PREFERENCES_CHANGED, preferences);
      });
      
      // Also send theme change event if theme was updated
      if (preferences.theme && preferences.theme !== 'system') {
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send(APP_EVENTS.THEME_CHANGED, { 
            theme: preferences.theme as 'light' | 'dark' 
          });
        });
      }
      
      return success(preferences);
    });
    
    // File operations
    handle(IPC_CHANNELS.OPEN_FILE, async (event, { filters }) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [{ name: 'All Files', extensions: ['*'] }]
      });
      
      if (result.canceled || !result.filePaths[0]) {
        return success(null);
      }
      
      const filePath = result.filePaths[0];
      const content = await fs.readFile(filePath, 'utf-8');
      
      return success({ filePath, content });
    });
    
    handle(IPC_CHANNELS.SAVE_FILE, async (event, { content, defaultPath }) => {
      const result = await dialog.showSaveDialog({
        defaultPath,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (result.canceled || !result.filePath) {
        return success({ success: false });
      }
      
      await fs.writeFile(result.filePath, content, 'utf-8');
      return success({ success: true, filePath: result.filePath });
    });
    
    handle(IPC_CHANNELS.GET_FILE_INFO, async (event, { filePath }) => {
      try {
        const stats = await fs.stat(filePath);
        const fileInfo: FileInfo = {
          name: path.basename(filePath),
          path: filePath,
          size: stats.size,
          type: path.extname(filePath),
          lastModified: stats.mtime
        };
        return success(fileInfo);
      } catch (err) {
        return error('FILE_NOT_FOUND', `File not found: ${filePath}`, err);
      }
    });
    
    // App operations
    handle(IPC_CHANNELS.GET_APP_CONFIG, async () => {
      const config: AppConfig = {
        version: app.getVersion(),
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        apiUrl: process.env.API_URL
      };
      return success(config);
    });
    
    // Window operations
    handle(IPC_CHANNELS.MINIMIZE_WINDOW, async (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
      return success(undefined);
    });
    
    handle(IPC_CHANNELS.MAXIMIZE_WINDOW, async (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window?.isMaximized()) {
        window.unmaximize();
      } else {
        window?.maximize();
      }
      return success(undefined);
    });
    
    handle(IPC_CHANNELS.CLOSE_WINDOW, async (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close();
      return success(undefined);
    });
    
    // Send app ready event when all modules are loaded
    app.whenReady().then(() => {
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send(APP_EVENTS.APP_READY);
      });
    });
  }
}