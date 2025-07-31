import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';
import {api, events} from './api.js';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

// Export the typed API and events
export {sha256sum, versions, send, api, events};
