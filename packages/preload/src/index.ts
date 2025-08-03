import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge} from 'electron';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
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
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls,
  fileUtils,
});

// Export the tRPC client and connection status
export {sha256sum, versions, send };
