import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge, webFrame} from 'electron';

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
};

// Get the API port
const apiPort = getApiPort();

// Shell utilities
const shell = {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
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

// Zoom utilities
const zoom = {
  getZoomFactor: () => webFrame.getZoomFactor(),
  notifyZoomChanged: (factor: number) => ipcRenderer.send('zoom:changed', factor),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls,
  fileUtils,
  shell,
  media,
  zoom,
  apiPort,
});

// Export the tRPC client and connection status
export {sha256sum, versions, send };
