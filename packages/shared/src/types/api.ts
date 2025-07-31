// API types for IPC communication between main and renderer

// Request/Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// IPC Channel names as const for type safety
export const IPC_CHANNELS = {
  // User operations
  GET_USER: 'user:get',
  UPDATE_USER: 'user:update',
  
  // File operations
  OPEN_FILE: 'file:open',
  SAVE_FILE: 'file:save',
  GET_FILE_INFO: 'file:info',
  
  // App operations
  GET_APP_CONFIG: 'app:config',
  UPDATE_PREFERENCES: 'app:preferences',
  
  // Window operations
  MINIMIZE_WINDOW: 'window:minimize',
  MAXIMIZE_WINDOW: 'window:maximize',
  CLOSE_WINDOW: 'window:close',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// Request types for each IPC channel
export interface IpcRequests {
  [IPC_CHANNELS.GET_USER]: { userId: string };
  [IPC_CHANNELS.UPDATE_USER]: { userId: string; updates: Partial<import('./models.js').User> };
  [IPC_CHANNELS.OPEN_FILE]: { filters?: Array<{ name: string; extensions: string[] }> };
  [IPC_CHANNELS.SAVE_FILE]: { content: string; defaultPath?: string };
  [IPC_CHANNELS.GET_FILE_INFO]: { filePath: string };
  [IPC_CHANNELS.GET_APP_CONFIG]: void;
  [IPC_CHANNELS.UPDATE_PREFERENCES]: import('./models.js').UserPreferences;
  [IPC_CHANNELS.MINIMIZE_WINDOW]: void;
  [IPC_CHANNELS.MAXIMIZE_WINDOW]: void;
  [IPC_CHANNELS.CLOSE_WINDOW]: void;
}

// Response types for each IPC channel
export interface IpcResponses {
  [IPC_CHANNELS.GET_USER]: import('./models.js').User;
  [IPC_CHANNELS.UPDATE_USER]: import('./models.js').User;
  [IPC_CHANNELS.OPEN_FILE]: { filePath: string; content: string } | null;
  [IPC_CHANNELS.SAVE_FILE]: { success: boolean; filePath?: string };
  [IPC_CHANNELS.GET_FILE_INFO]: import('./models.js').FileInfo;
  [IPC_CHANNELS.GET_APP_CONFIG]: import('./models.js').AppConfig;
  [IPC_CHANNELS.UPDATE_PREFERENCES]: import('./models.js').UserPreferences;
  [IPC_CHANNELS.MINIMIZE_WINDOW]: void;
  [IPC_CHANNELS.MAXIMIZE_WINDOW]: void;
  [IPC_CHANNELS.CLOSE_WINDOW]: void;
}