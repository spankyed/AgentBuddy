// Events the app's clients send its backend systems (the API's `bus.send`): checked against the registered systems,
// logged and put on the root event bus the app bus listens to (the SDK's bound transport).
import { _rootEvents } from '@abuddy/sdk/runtime';
import { createLogger } from '@abuddy/sdk/logger';
import type { PackRegistry } from '../packs/registry.ts';
import type { Message } from '@abuddy/sdk/events';

const logger = createLogger('app-events');

/** A client sent an event to a system that isn't registered, or of a type that system doesn't accept */
export class UnknownClientEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownClientEventError';
  }
}

/** The event as logged: arrays over 5 items become their count and first 5 */
function summarizeEventForLog(event: Message['event']) {
  const MAX_ARRAY_LOG_SIZE = 5;
  const summary: Record<string, unknown> = {};
  let truncated = false;

  for (const [key, value] of Object.entries(event)) {
    if (Array.isArray(value) && value.length > MAX_ARRAY_LOG_SIZE) {
      summary[key] = { count: value.length, sample: value.slice(0, MAX_ARRAY_LOG_SIZE) };
      truncated = true;
    } else {
      summary[key] = value;
    }
  }

  return truncated ? summary : event;
}

/**
 * Checks a client's message against the systems in `registry` (`getEventValidationMap()`; a `*` entry accepts any type),
 * logs it and emits it on the root event bus. Throws `UnknownClientEventError` for an unknown system or event type.
 */
export function receiveClientEvent(registry: Pick<PackRegistry, 'getEventValidationMap'>, message: Message): void {
  const { to, event } = message;
  const validTypes = registry.getEventValidationMap().get(to);
  if (!validTypes) {
    throw new UnknownClientEventError(`Unknown system: "${to}"`);
  }
  if (!validTypes.has('*') && !validTypes.has(event.type)) {
    throw new UnknownClientEventError(`Unknown event "${event.type}" for system "${to}"`);
  }

  logger.info(`→ Incoming: "${event.type}"`, { to, event: summarizeEventForLog(event) });
  _rootEvents.emitIncoming(message);
}
