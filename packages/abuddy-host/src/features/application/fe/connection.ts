// This window's subscription to the bus, held by a child actor over the shell's client: the connection's lifecycle
// becomes the shell's events, and each message goes to the plugin it's for — named as it is handled, so a send
// that plugin makes in answer carries its own ref (`notifyPluginActor`/`sendToPluginActor`). This is the path every backend
// `broadcastToPlugin` takes, and it set no name until it was tested for one.
import { fromCallback } from 'xstate';
import { senderSuffix } from '@abuddy/sdk/events';
import type { ShellClient } from '../../../fe/client.ts';
import { notifyPluginActor, sendToPluginActor } from '../../../fe/plugin-delivery.ts';
import { HOST } from '../../../refs.ts';
import type { ShellEvent } from './types.ts';

export function connectionListener(client: ShellClient) {
  return fromCallback<ShellEvent>(({ system, sendBack }) => client.subscribe({
    onConnected: () => sendBack({ type: 'BUS_SUBSCRIBED' }),
    onDisconnected: () => sendBack({ type: 'BUS_CONNECTION_LOST' }),
    onFailed: (error) => sendBack({ type: 'BACKEND_ERROR', error }),
    // The event arrives exactly as the system sent it
    onMessage: (message) => {
      const { to, event, sender, call, answering } = message;
      if (to === HOST.application) {
        // Every window hears it; the shell tells a backend's request to open a plugin from its own window's
        sendBack((event.type === 'OPEN_PLUGIN' ? { ...event, type: 'OPEN_PLUGIN_FROM_APP' } : event) as ShellEvent);
        return;
      }
      const plugin = system.get(to);
      if (!plugin) {
        // The sender survives the subscription, which carries the message whole: name it when the send stamped one
        const suffix = senderSuffix(message);
        console.warn(`[shell] No plugin is running at ${to} for ${event.type}${suffix && ` sent${suffix}`}`);
        return;
      }
      // Whether the backend asked or only told is the wire's to say, and it is a branch rather than a value: a
      // `sender` arriving means the plugin's handler is handed a `reply` that goes back out over this connection,
      // to that system alone rather than to its own copy in every window that shows it. A broadcast names none.
      // The call rides along so the plugin's own guards can tell this answer from one for a request it has
      // since abandoned — `callOf(event)`, injected by the door rather than declared on any contract
      const correlation = { ...(call === undefined ? {} : { call }), ...(answering === undefined ? {} : { answering }) };
      if (sender === undefined) notifyPluginActor(plugin, to, event, correlation);
      else sendToPluginActor(plugin, to, event, { kind: 'bus', ref: sender }, correlation);
    },
  }));
}
