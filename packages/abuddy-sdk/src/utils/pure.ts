// Environment-agnostic utilities — safe to import from browser/renderer code.
// Node-dependent code lives in ./index.ts (the '@abuddy/sdk/utils' barrel).
// When adding a new pure utility, export it from here; if it needs fs/path/etc, export from index.ts only.
export * from './shared.js';
export * from './compare-versions.js';
export { randomId, type RandomIdOptions } from './random-id.js';
export * from './change-mapping.js';
export * from './change-detection.js';
