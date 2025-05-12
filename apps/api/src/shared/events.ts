import { z } from 'zod';
import { AgentEvents } from '../state/plugins/agent/state';
import type { EventsFromSchemas } from './plugin-bus';

const BusEvents = [
  ...AgentEvents,
] as const

export type IncomingPluginEvents =
| EventsFromSchemas<typeof AgentEvents>

export type OutgoingPluginEvents = IncomingPluginEvents; // TODO: Define outgoing events

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingPluginEvents> = z.discriminatedUnion('type', BusEvents);
