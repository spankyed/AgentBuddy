import { rootEvents } from '@/core/router/bus-emitter';
import type { OutgoingSystemEvents, IncomingSystemEvents } from '@/core/router/events';
import type { EARS } from '@/core/types';

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/**
 * Emit an event to a frontend plugin
 * @param pluginId - The target plugin ID (or 'application' for main plugin)
 * @param event - The event to emit (without pluginId)
 * @example
 * sendToPlugin('threads', {
 *   type: 'TOKEN_STREAM',
 *   token: 'Hello'
 * });
 */
export function sendToPlugin<P extends OutgoingSystemEvents['pluginId']>(
  pluginId: P,
  event: DistributiveOmit<Extract<OutgoingSystemEvents, { pluginId: P }>, 'pluginId'>
): void {
  const fullEvent = { ...event, pluginId } as OutgoingSystemEvents;
  rootEvents.emitOutgoing(fullEvent);
}

/**
 * Emit an event to a backend system
 * @param systemId - The target system ID
 * @param event - The system event to emit (without systemId)
 * @example
 * sendToSystem('threads', {
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
 * Emit TRIGGER_BRAIN_EVENT to brain system (internal use only)
 * Used by node handlers to fire events during flow execution
 * @param event - The brain event to emit
 * @example
 * sendToBrainSystem({
 *   eventType: 'user.login',
 *   payload: { userId: '123' },
 *   targetFlowId: 'TNode-123'
 * });
 */
export function sendToBrainSystem(event: {
  eventType: string;
  payload?: any;
  targetFlowId?: EARS.EntityId;
}): void {
  rootEvents.emitIncoming({
    ...event,
    type: 'TRIGGER_BRAIN_EVENT',
    systemId: 'brain'
  } as any);
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
