import type { ApplicationConnectedEvent, OutgoingSystemEvents as BusOutgoingEvents } from '@abuddy/host/bus';
import type { SystemErrorEvent } from '@abuddy/sdk/logger';

export type {
  BackendEvents,
  BusEvent,
  IncomingSystemEvents,
  ReloadPackEvent,
  TeardownPackEvent,
  ActivatePackEvent,
  PackClientConnectedEvent,
  SystemsSpawnedEvent,
} from '@abuddy/host/bus';
export type { SystemEvents } from '@abuddy/sdk/framework';
/** What the app sends the application plugin */
export type ApplicationOutgoingEvents = ApplicationConnectedEvent | SystemErrorEvent;
export type OutgoingSystemEvents = BusOutgoingEvents | ApplicationOutgoingEvents;
