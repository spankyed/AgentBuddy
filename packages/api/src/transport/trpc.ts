import { initTRPC } from '@trpc/server';
import type { RpcContext } from './context';

const t = initTRPC.context<RpcContext>().create();

export const router    = t.router;
export const procedure = t.procedure;
