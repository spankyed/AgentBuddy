import { z } from 'zod';
import type { AddPrefix } from './prefix-events';
import type { Ev } from '../state/bus';

/** TypeScript discriminated-union of ALL wire events */
export type WireEvent =
  | AddPrefix<Ev, 'SYS'>

/** Zod validator derived from that union */
export const WireEventSchema: z.ZodType<WireEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SYS::USER_MSG'), content: z.string() }),
  z.object({ type: z.literal('SYS::LLM_DONE') }),
  z.object({ type: z.literal('SYS::TOKEN'), token: z.string() }),
  z.object({ type: z.literal('SYS::CANCEL') }),
]);
