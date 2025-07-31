import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';
import {trpc, getConnectionStatus} from './trpc-client.js';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

// Export the tRPC client and connection status
export {sha256sum, versions, send, trpc, getConnectionStatus};
