import { z } from 'zod';
import { type agent, IncomingAgentEvents, type OutgoingAgentEvents } from '../state/plugins/agent/state';
import type { EventsFromSchemas, WithPlugin } from './plugin-bus';

const BusEvents = [
  ...IncomingAgentEvents,
] as const

export type IncomingPluginEvents =
  | EventsFromSchemas<typeof IncomingAgentEvents>

export type OutgoingPluginEvents = 
  | WithPlugin<typeof agent, OutgoingAgentEvents>

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingPluginEvents> = z.discriminatedUnion('type', BusEvents);
