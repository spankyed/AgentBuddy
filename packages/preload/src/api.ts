import { ipcRenderer } from 'electron';
import type { 
  User, 
  UserPreferences, 
  AppConfig,
  FileInfo,
  ApiResponse,
  IpcChannel,
  IpcRequests,
  IpcResponses,
  AppEvent,
  AppEventPayloads
} from '@app/shared';
import { IPC_CHANNELS, APP_EVENTS } from '@app/shared';

// Type-safe IPC invoke wrapper
async function invoke<T extends IpcChannel>(
  channel: T,
  ...args: IpcRequests[T] extends void ? [] : [IpcRequests[T]]
): Promise<IpcResponses[T]> {
  const response = await ipcRenderer.invoke(channel, ...args) as ApiResponse<IpcResponses[T]>;
  
  if (!response.success && response.error) {
    throw new Error(response.error.message);
  }
  
  return response.data!;
}

// Typed API object to expose to renderer
export const api = {
  // User operations
  getUser: (userId: string) => invoke(IPC_CHANNELS.GET_USER, { userId }),
  
  updateUser: (userId: string, updates: Partial<User>) => 
    invoke(IPC_CHANNELS.UPDATE_USER, { userId, updates }),
  
  updatePreferences: (preferences: UserPreferences) => 
    invoke(IPC_CHANNELS.UPDATE_PREFERENCES, preferences),
  
  // File operations
  openFile: async (filters?: Array<{ name: string; extensions: string[] }>) => 
    invoke(IPC_CHANNELS.OPEN_FILE, { filters }),
  
  saveFile: async (content: string, defaultPath?: string) => 
    invoke(IPC_CHANNELS.SAVE_FILE, { content, defaultPath }),
  
  getFileInfo: async (filePath: string) => 
    invoke(IPC_CHANNELS.GET_FILE_INFO, { filePath }),
  
  // App operations
  getAppConfig: () => invoke(IPC_CHANNELS.GET_APP_CONFIG),
  
  // Window operations
  minimizeWindow: () => invoke(IPC_CHANNELS.MINIMIZE_WINDOW),
  maximizeWindow: () => invoke(IPC_CHANNELS.MAXIMIZE_WINDOW),
  closeWindow: () => invoke(IPC_CHANNELS.CLOSE_WINDOW),
};

// Type-safe event listener wrapper
export function onAppEvent<T extends AppEvent>(
  event: T,
  callback: (payload: AppEventPayloads[T]) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: AppEventPayloads[T]) => {
    callback(payload);
  };
  
  ipcRenderer.on(event, listener);
  
  // Return unsubscribe function
  return () => {
    ipcRenderer.removeListener(event, listener);
  };
}

// Export typed event listeners
export const events = {
  onAppReady: (callback: () => void) => 
    onAppEvent(APP_EVENTS.APP_READY, callback),
  
  onAppClosing: (callback: (data: { restart: boolean }) => void) => 
    onAppEvent(APP_EVENTS.APP_CLOSING, callback),
  
  onFileChanged: (callback: (data: { filePath: string; changeType: 'modified' | 'renamed' }) => void) => 
    onAppEvent(APP_EVENTS.FILE_CHANGED, callback),
  
  onUserLoggedIn: (callback: (user: User) => void) => 
    onAppEvent(APP_EVENTS.USER_LOGGED_IN, callback),
  
  onPreferencesChanged: (callback: (preferences: UserPreferences) => void) => 
    onAppEvent(APP_EVENTS.PREFERENCES_CHANGED, callback),
  
  onThemeChanged: (callback: (data: { theme: 'light' | 'dark' }) => void) => 
    onAppEvent(APP_EVENTS.THEME_CHANGED, callback),
  
  onNetworkStatus: (callback: (data: { online: boolean }) => void) => 
    onAppEvent(APP_EVENTS.NETWORK_STATUS, callback),
};