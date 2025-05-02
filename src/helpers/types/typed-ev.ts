import type { ApplicationEvent } from "../../state/application";

// Helper type to extract specific event types
type ExtractEvent<TEvent extends ApplicationEvent, TType extends TEvent['type']> = Extract<TEvent, { type: TType }>

// Helper function for type-safe event handling
export function typeOf<T extends ApplicationEvent['type']>(type: T, event: ApplicationEvent): ExtractEvent<ApplicationEvent, T>{
  if (event.type !== type) {
    throw new Error(`Expected event type ${type}, got ${event.type}`);
  }
  return event as ExtractEvent<ApplicationEvent, T>;
}
