import { z } from 'zod';
import type { EventsFromSchemas } from '@/core/helpers/event-helpers';
import { events } from '@/systems';

export type OutgoingSystemEvents = typeof events.outgoing;
export type IncomingSystemEvents = EventsFromSchemas<typeof events.incoming>;

/** Zod validator derived from above union */
export const IncomingEventSchema: z.ZodType<IncomingSystemEvents> = z.discriminatedUnion('type', events.incoming);
