import { z } from 'zod';
import { AgentPluginEvents  } from '../state/plugins/agent/state';
import { mergePlugins, type EventsFromSchemas } from './type-helpers';

const events = mergePlugins(
  AgentPluginEvents,
);

export type OutgoingPluginEvents = typeof events.outgoing;
export type IncomingPluginEvents = EventsFromSchemas<typeof events.incoming>;

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingPluginEvents> = z.discriminatedUnion('type', events.incoming);
