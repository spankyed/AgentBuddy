// Framework
export { defineSystem, type SystemSpec, type SystemEvents } from './framework/index.js';

// Helpers
export { safeEvents, emit } from './helpers/index.js';
export type { Simplify } from './helpers/index.js';

// Types
export { EARS, type BaseEntity } from './types/index.js';

// Designations
export { registerDesignations, getDesignated, hasDesignation } from './designations/index.js';
export type { Designations } from './designations/index.js';

// System IDs
export { bus } from './ids/index.js';

// EARS runtime (pack-facing)
export { tx, defineEars, type EARSRuntimeDeps } from './ears/index.js';
