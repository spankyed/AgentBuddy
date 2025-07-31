// Event types for real-time communication from main to renderer

export const APP_EVENTS = {
  // Application lifecycle
  APP_READY: 'app:ready',
  APP_CLOSING: 'app:closing',
  
  // File system events
  FILE_CHANGED: 'file:changed',
  FILE_DELETED: 'file:deleted',
  
  // User events
  USER_LOGGED_IN: 'user:logged-in',
  USER_LOGGED_OUT: 'user:logged-out',
  PREFERENCES_CHANGED: 'user:preferences-changed',
  
  // System events
  THEME_CHANGED: 'system:theme-changed',
  NETWORK_STATUS: 'system:network-status',
  
  // Task events
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
} as const;

export type AppEvent = typeof APP_EVENTS[keyof typeof APP_EVENTS];

// Event payload types
export interface AppEventPayloads {
  [APP_EVENTS.APP_READY]: void;
  [APP_EVENTS.APP_CLOSING]: { restart: boolean };
  [APP_EVENTS.FILE_CHANGED]: { filePath: string; changeType: 'modified' | 'renamed' };
  [APP_EVENTS.FILE_DELETED]: { filePath: string };
  [APP_EVENTS.USER_LOGGED_IN]: import('./models.js').User;
  [APP_EVENTS.USER_LOGGED_OUT]: void;
  [APP_EVENTS.PREFERENCES_CHANGED]: import('./models.js').UserPreferences;
  [APP_EVENTS.THEME_CHANGED]: { theme: 'light' | 'dark' };
  [APP_EVENTS.NETWORK_STATUS]: { online: boolean };
  [APP_EVENTS.TASK_CREATED]: import('./models.js').Task;
  [APP_EVENTS.TASK_UPDATED]: import('./models.js').Task;
  [APP_EVENTS.TASK_DELETED]: { taskId: string };
}