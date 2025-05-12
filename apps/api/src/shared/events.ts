import { z } from 'zod';
import { AgentPluginEvents  } from '../state/plugins/agent/state';
import { fromPlugin, type EventsFromSchemas } from './plugin-bus';

const events = {
 ...AgentPluginEvents
};

export type OutgoingPluginEvents = typeof events.outgoing;
export type IncomingPluginEvents = EventsFromSchemas<typeof events.incoming>;

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingPluginEvents> = z.discriminatedUnion('type', events.incoming);
