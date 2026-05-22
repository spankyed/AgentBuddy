/**
 * Brain Ad-Hoc Event Listener Service
 *
 * Allows action/output nodes to register persistent event listeners
 * that survive beyond the node's execution. This is an escape hatch
 * that bypasses the normal flow architecture (listen node -> output nodes).
 * The developer is responsible for manual cleanup.
 *
 * @example
 * // In action code:
 * const unsub = services.brain.listen('user.message', (event) => {
 *   services.chat.sendBlockMessage({ threadId: '...', text: event.payload.message });
 * });
 * unsub(); // cleanup
 *
 * // Named listener for cross-action cleanup:
 * services.brain.listen('user.message', callback, { id: 'my-listener' });
 * // Later, in a different action:
 * services.brain.unlisten('my-listener');
 */
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('brain-service');

// --- Types ---

export interface BrainEventPayload {
  type: string;
  payload?: any;
  targetFlowId?: string;
}

export type BrainEventCallback = (event: BrainEventPayload) => void | Promise<void>;

export interface ListenOptions {
  /** Named ID for cross-action cleanup via unlisten(). If omitted, an auto-incremented ID is used. */
  id?: string;
}

interface ListenerEntry {
  id: string;
  eventType: string;
  callback: BrainEventCallback;
}

// --- Internal State ---

/** Primary index: eventType -> Map<id, entry> for fast notification */
const listenersByEvent = new Map<string, Map<string, ListenerEntry>>();

/** Secondary index: id -> entry for fast unlisten() lookup */
const listenersById = new Map<string, ListenerEntry>();

/** Auto-increment counter for unnamed listeners */
let nextAutoId = 1;

// --- Public API (exposed to action code via services.brain) ---

/**
 * Register an ad-hoc brain event listener.
 * Returns an unsubscribe function for cleanup.
 *
 * If a named `id` is provided and already exists, the old listener is replaced.
 */
export function listen(
  eventType: string,
  callback: BrainEventCallback,
  options?: ListenOptions,
): () => void {
  const id = options?.id ?? `__auto_${nextAutoId++}`;

  // If named ID already exists, remove the old one first
  if (listenersById.has(id)) {
    removeListener(id);
  }

  const entry: ListenerEntry = { id, eventType, callback };

  if (!listenersByEvent.has(eventType)) {
    listenersByEvent.set(eventType, new Map());
  }
  listenersByEvent.get(eventType)!.set(id, entry);
  listenersById.set(id, entry);

  logger.debug(`Ad-hoc listener registered: "${eventType}" (id: ${id})`);

  return () => removeListener(id);
}

/**
 * Remove a named listener by its ID.
 * No-op if the ID doesn't exist.
 */
export function unlisten(id: string): boolean {
  return removeListener(id);
}

// --- Internal API (called by brain/system.ts) ---

/**
 * Notify all ad-hoc listeners matching the given eventType.
 * Called by triggerBrainEvent AFTER normal flow routing.
 *
 * - Async callbacks are fire-and-forget
 * - Errors in one listener do not affect others or the brain system
 */
export function notify(
  eventType: string,
  payload?: any,
  targetFlowId?: string,
): void {
  const eventListeners = listenersByEvent.get(eventType);
  if (!eventListeners || eventListeners.size === 0) return;

  const event: BrainEventPayload = { type: eventType, payload, targetFlowId };

  for (const entry of Array.from(eventListeners.values())) {
    try {
      const result = entry.callback(event);
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<void>).catch((err) => {
          logger.error(`Ad-hoc listener error (async) [${entry.id}]:`, { error: err });
        });
      }
    } catch (err) {
      logger.error(`Ad-hoc listener error (sync) [${entry.id}]:`, { error: err });
    }
  }
}

/**
 * Remove all ad-hoc listeners. Safety net called on brain kill/restart.
 */
export function removeAllListeners(): void {
  const count = listenersById.size;
  listenersByEvent.clear();
  listenersById.clear();
  if (count > 0) {
    logger.info(`Cleared ${count} ad-hoc brain listener(s)`);
  }
}

// --- Internal helpers ---

function removeListener(id: string): boolean {
  const entry = listenersById.get(id);
  if (!entry) return false;

  const eventMap = listenersByEvent.get(entry.eventType);
  if (eventMap) {
    eventMap.delete(id);
    if (eventMap.size === 0) {
      listenersByEvent.delete(entry.eventType);
    }
  }

  listenersById.delete(id);
  logger.debug(`Ad-hoc listener removed: "${entry.eventType}" (id: ${id})`);
  return true;
}
