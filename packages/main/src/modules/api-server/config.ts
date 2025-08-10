import { app } from 'electron';
import * as path from 'path';

// API Server Configuration
export const API_CONFIG = {
  DEFAULT_PORT: 3001,
  MAX_RESTART_ATTEMPTS: 3,
  RESTART_DELAY: 2000,
  SHUTDOWN_TIMEOUT: 5000,
  SUCCESS_CHECK_DELAY: 5000,
  READY_TIMEOUT: 30000,
} as const;

// API Server Events
export const API_EVENTS = {
  STARTING: 'api:starting',
  STARTED: 'api:started',
  STOPPED: 'api:stopped',
  ERROR: 'api:error',
  RESTARTING: 'api:restarting',
} as const;

// Path Configuration
export const getApiPaths = () => {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // Use app.getAppPath() to get the project root reliably
    // In dev, this returns the project root directory
    const appPath = app.getAppPath();
    return {
      apiPath: path.join(appPath, 'packages', 'api'),
      serverFile: 'dist/server.js',
    };
  }
  
  // Production paths
  const primaryPath = path.join(process.resourcesPath, 'app', 'packages', 'api');
  const fallbackPath = path.join(process.resourcesPath, 'app', 'node_modules', '@app', 'api');
  
  return {
    apiPath: primaryPath,
    fallbackPath,
    serverFile: 'dist/server.js',
  };
};

// Environment Configuration
export const getEnvironment = (port: number) => ({
  ...process.env,
  NODE_ENV: app.isPackaged ? 'production' : 'development',
  API_PORT: port.toString(),
  DATABASE_PATH: path.join(app.getPath('userData'), 'database.db'),
  USER_DATA_PATH: app.getPath('userData'),
  ELECTRON_RUN_AS_NODE: '1',
});

// Node Executable Configuration
export const getNodeExecutable = () => {
  // In production, use Electron's built-in Node to ensure native module compatibility
  return app.isPackaged ? process.execPath : 'node';
};

// Execution Arguments
export const getExecutionArgs = (apiPath: string, serverFile: string) => {
  // When using Electron's executable, we need to pass the full path
  const fullPath = path.join(apiPath, serverFile);
  return app.isPackaged ? [fullPath] : [serverFile];
};