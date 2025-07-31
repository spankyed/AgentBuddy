// Minimal router for Electron that excludes systems requiring native modules
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// Create a minimal router without the full system bus
export const minimalAppRouter = t.router({
  health: t.procedure.query(() => ({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  }))
});

export type MinimalAppRouter = typeof minimalAppRouter;