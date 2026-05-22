/**
 * Well-known system IDs. Systems reference these instead of importing
 * from each other's system.ts files — eliminates cross-system coupling.
 */

export const bus = 'bus' as const;
export const brain = 'brain' as const;
export const threads = 'threads' as const;
export const settings = 'settings' as const;
export const flows = 'flows' as const;
export const actions = 'actions' as const;
export const prompts = 'prompts' as const;
export const library = 'library' as const;
export const database = 'database' as const;
export const code = 'code' as const;
export const notes = 'notes' as const;
export const logs = 'logs' as const;
