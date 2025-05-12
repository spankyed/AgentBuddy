import { z } from 'zod';
import { type EventsFromSchemas, pluginBus } from './plugin-bus';

const busEvent = pluginBus('chat')

const ChatEvents = [
  busEvent('USER_MSG', { content: z.string() }),
  busEvent('LLM_DONE'),
  busEvent('TOKEN', { token: z.string() }),
  busEvent('CANCEL'),
] as const

export type WireEvent =
  | EventsFromSchemas<typeof ChatEvents>

/** Zod validator derived from that union */
export const WireEventSchema: z.ZodType<WireEvent> = z.discriminatedUnion('type', ChatEvents);
