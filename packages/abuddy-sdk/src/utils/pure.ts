// Environment-agnostic utilities — safe to import from browser/renderer code.
// Node-dependent code lives in ./index.ts (the '@abuddy/sdk/utils' barrel).
// When adding a new pure utility, export it from here; if it needs fs/path/etc, export from index.ts only.
export * from './shared.ts';
export * from './compare-versions.ts';
export { randomId, type RandomIdOptions } from './random-id.ts';
export * from './change-mapping.ts';
export * from './change-detection.ts';
