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

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls,
});

// Export the tRPC client and connection status
export {sha256sum, versions, send };
