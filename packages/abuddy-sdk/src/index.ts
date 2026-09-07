// Framework
export { defineSystem, type SystemDefinition, type SystemEvents } from './framework/index';

// Helpers
export { safeEvents, emit } from './helpers/index';
export type { Simplify } from './helpers/index';

// Types
export { EARS, type BaseEntity } from './types/index';

// Designations
export { registerDesignations, getDesignated, hasDesignation } from './designations/index';
export type { Designations } from './designations/index';

// System IDs
export { bus } from './ids/index';

// EARS runtime
export { initEARSRuntime, qx, tx, createEntity, type EARSRuntimeDeps } from './ears/index';
