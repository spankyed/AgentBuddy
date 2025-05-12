import { z } from 'zod';

/** TypeScript discriminated-union of ALL wire events */
export type WireEvent =
  | { type: 'USER_MSG'; content: string }
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN'; token: string }
  | { type: 'CANCEL' };

/** Zod validator derived from that union */
export const WireEventSchema: z.ZodType<WireEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('USER_MSG'), content: z.string() }),
  z.object({ type: z.literal('LLM_DONE') }),
  z.object({ type: z.literal('TOKEN'), token: z.string() }),
  z.object({ type: z.literal('CANCEL') }),
]);
