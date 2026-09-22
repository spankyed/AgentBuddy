// This window's registered pack frontends, apart from the port that binds them, so the pack loader and the shell
// can reach them without importing the API client
import { createFePackRegistry } from '@abuddy/host/fe';

/**
 * This window's registered pack frontends: the built-in packs' (main.ts) and the external packs' the pack loader
 * loads. The SDK's frontend lookups (steps, designations, tiptap plugins, DSL types) read it once bound.
 */
export const fePacks = createFePackRegistry();
