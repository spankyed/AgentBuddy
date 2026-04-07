import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge, webFrame, webUtils} from 'electron';
import type {SpeechEvent} from '../../../types/speech.js';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

// Parse API port from command line arguments
function getApiPort(): number {
  // Look for --api-port= in process.argv
  const portArg = process.argv.find(arg => arg.startsWith('--api-port='));
  if (portArg) {
    const port = parseInt(portArg.split('=')[1], 10);
    return port;
  }
  return 3001;
}

// Window controls API
const windowControls = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
};

// File utilities
const fileUtils = {
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  selectPath: (options?: {
    allowMultiple?: boolean;
    type: 'file' | 'directory' | 'both';
  }) => ipcRenderer.invoke('dialog:select-path', options),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  readFileBase64: (filePath: string) => ipcRenderer.invoke('file:read-base64', filePath) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
};

// Get the API port
const apiPort = getApiPort();

// Shell utilities
const shell = {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
};

// Media utilities
const media = {
  upload: (entityId: string, base64Data: string, mimeType: string) =>
    ipcRenderer.invoke('media:upload', entityId, base64Data, mimeType) as Promise<string>,
  delete: (entityId: string, filename: string) =>
    ipcRenderer.invoke('media:delete', entityId, filename) as Promise<void>,
  deleteAll: (entityId: string) =>
    ipcRenderer.invoke('media:delete-all', entityId) as Promise<void>,
};

// Speech recognition
const speechRecognition = {
  start: (lang?: string) => ipcRenderer.invoke('speech:start', lang),
  stop: () => ipcRenderer.invoke('speech:stop'),
  isAvailable: () => ipcRenderer.invoke('speech:isAvailable') as Promise<{ available: boolean }>,
  onEvent: (callback: (event: SpeechEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: SpeechEvent) => callback(event);
    ipcRenderer.on('speech:event', handler);
    return () => { ipcRenderer.removeListener('speech:event', handler); };
  },
};

// Zoom utilities
const zoom = {
  getZoomFactor: () => webFrame.getZoomFactor(),
  notifyZoomChanged: (factor: number) => ipcRenderer.send('zoom:changed', factor),
};

// API status events (backend crash/restart notifications from main process)
const apiStatus = {
  getStatus: () => ipcRenderer.invoke('api:get-status') as Promise<{
    running: boolean;
    port?: number;
    error?: { message: string; stack?: string };
    restartAttempts: number;
  }>,
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onEvent: (callback: (event: { type: string; error?: string; attempt?: number; maxAttempts?: number }) => void) => {
    const channels = ['api:stopped', 'api:error', 'api:restarting'];
    const handlers = channels.map(channel => {
      const handler = (_: Electron.IpcRendererEvent, data?: any) => {
        callback({ type: channel, ...data });
      };
      ipcRenderer.on(channel, handler);
      return { channel, handler };
    });
    return () => {
      handlers.forEach(({ channel, handler }) => ipcRenderer.removeListener(channel, handler));
    };
  },
};

// App update events
const appUpdate = {
  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => { ipcRenderer.removeListener('update:available', handler); };
  },
  onDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('update:download-progress', handler);
    return () => { ipcRenderer.removeListener('update:download-progress', handler); };
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => { ipcRenderer.removeListener('update:downloaded', handler); };
  },
  onUpdateError: (callback: (message: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('update:error', handler);
    return () => { ipcRenderer.removeListener('update:error', handler); };
  },
  startDownload: () => ipcRenderer.invoke('update:start-download'),
  installAndRestart: () => ipcRenderer.invoke('update:install'),
  dismissUpdate: (version: string) => ipcRenderer.invoke('update:dismiss', version),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls,
  fileUtils,
  shell,
  media,
  speechRecognition,
  zoom,
  apiStatus,
  appUpdate,
  apiPort,
});

// Export the tRPC client and connection status
export {sha256sum, versions, send };
