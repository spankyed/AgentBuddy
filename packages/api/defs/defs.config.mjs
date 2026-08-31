/**
 * DSL Definitions Manifest
 *
 * Declares which DSL entry files to bundle and where to output them.
 * Read by rollup-defs.config.mjs to generate configs programmatically.
 *
 * targets:
 *   'monaco'    — wrapped in `declare module`, output to abuddy-sdk/types-generated/
 *   'authoring' — unwrapped, output to default-setup/defs/ for DSL authoring type-safety
 */
export default [
  { name: 'action',        entry: './action.ts',        targets: ['monaco', 'authoring'] },
  { name: 'prompt',        entry: './prompt.ts',        targets: ['monaco', 'authoring'] },
  { name: 'database',      entry: './database.ts',      targets: ['monaco'] },
  { name: 'default-setup', entry: './default-setup.ts', targets: ['authoring'] },
];
