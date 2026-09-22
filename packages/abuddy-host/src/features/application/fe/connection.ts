// This window's subscription to the bus, held by a child actor over the shell's client: the connection's lifecycle
// becomes the shell's events, and each message goes to the plugin it's for.
import { fromCallback } from 'xstate';
import type { ShellClient } from '../../../fe/client.ts';
import { HOST } from '../../../refs.ts';
import type { ShellEvent } from './types.ts';

export function connectionListener(client: ShellClient) {
  return fromCallback<ShellEvent>(({ system, sendBack }) => client.subscribe({
    onConnected: () => sendBack({ type: 'BUS_SUBSCRIBED' }),
    onDisconnected: () => sendBack({ type: 'BUS_CONNECTION_LOST' }),
    onFailed: (error) => sendBack({ type: 'BACKEND_ERROR', error }),
    // The event arrives exactly as the system sent it
    onMessage: ({ to, event }) => {
      if (to === HOST.application) {
        // Every window hears it; the shell tells a backend's request to open a plugin from its own window's
        sendBack((event.type === 'OPEN_PLUGIN' ? { ...event, type: 'OPEN_PLUGIN_FROM_APP' } : event) as ShellEvent);
        return;
      }
      const plugin = system.get(to);
      if (plugin) plugin.send(event);
      else console.warn(`[shell] No plugin is running at ${to} for ${event.type}`);
    },
  }));
}
