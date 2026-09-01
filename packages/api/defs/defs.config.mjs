/**
 * DSL Definitions Manifest
 *
 * Declares which DSL entry files to bundle and where to output them.
 * Read by rollup-defs.config.mjs to generate configs programmatically.
 *
 * targets:
 *   'monaco'    — wrapped in `declare module`, output to dist/defs/monaco/
 *   'authoring' — unwrapped, output to dist/defs/ for DSL authoring type-safety
 */
export default [
  { name: 'host',          entry: './host.ts',          targets: ['authoring'] },
  { name: 'action',        entry: './action.ts',        targets: ['monaco', 'authoring'] },
  { name: 'prompt',        entry: './prompt.ts',        targets: ['monaco', 'authoring'] },
  { name: 'database',      entry: './database.ts',      targets: ['monaco'] },
  { name: 'default-setup', entry: './default-setup.ts', targets: ['authoring'] },
];
