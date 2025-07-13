import { rootEvents } from '@/core/router/bus-emitter';
import type { OutgoingSystemEvents, IncomingSystemEvents } from '@/core/router/events';

/**
 * Emit an event to a frontend plugin
 * @param pluginId - The target plugin ID (or 'application' for main plugin)
 * @param event - The event to emit (without pluginId)
 * @example
 * emitToPlugin('agent', {
 *   type: 'TOKEN_STREAM',
 *   token: 'Hello'
 * });
 */
export function sendToPlugin<T extends OutgoingSystemEvents>(
  pluginId: string,
  event: Omit<T, 'pluginId'>
): void {
  const fullEvent = { ...event, pluginId } as OutgoingSystemEvents;
  rootEvents.emitOutgoing(fullEvent);
}

/**
 * Emit an event to a backend system
 * @param systemId - The target system ID
 * @param event - The system event to emit (without systemId)
 * @example
 * emitToSystem('threads', {
 *   type: 'CREATE_THREAD',
 *   title: 'New Thread'
 * });
 */
export function sendToSystem<T extends IncomingSystemEvents>(
  systemId: string,
  event: Omit<T, 'systemId'>
): void {
  const fullEvent = { ...event, systemId } as IncomingSystemEvents;
  rootEvents.emitIncoming(fullEvent);
}

/**
 * Subscribe to outgoing events (events going to frontend)
 * @param callback - Function to call when an outgoing event is emitted
 * @returns Unsubscribe function
 */
export function onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void {
  return rootEvents.onOutgoing(callback);
}

/**
 * Subscribe to incoming events (events from frontend or internal)
 * @param callback - Function to call when an incoming event is emitted
 * @returns Unsubscribe function
 */
export function onIncoming(callback: (event: IncomingSystemEvents) => void): () => void {
  return rootEvents.onIncoming(callback);
}
