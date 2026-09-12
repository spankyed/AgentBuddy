// Environment-agnostic utilities — safe to import from browser/renderer code.
// Node-dependent code lives in ./index.ts (the '@abuddy/sdk/utils' barrel).
// When adding a new pure utility, export it from here; if it needs fs/path/etc, export from index.ts only.
export * from './shared';
export * from './compare-versions';
export { randomId, type RandomIdOptions } from './random-id';
export * from './change-mapping';
export * from './change-detection';
