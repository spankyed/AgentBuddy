import { z } from 'zod';
import type { EventsFromSchemas } from '@/shared/event-helpers';
import { events } from '@/actors';

export type OutgoingPluginEvents = typeof events.outgoing;
export type IncomingPluginEvents = EventsFromSchemas<typeof events.incoming>;

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingPluginEvents> = z.discriminatedUnion('type', events.incoming);
