import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge} from 'electron';

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
};

// Get the API port
const apiPort = getApiPort();

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls,
  fileUtils,
  apiPort,
});

// Export the tRPC client and connection status
export {sha256sum, versions, send };
