/**
 * Types for `loop-sample.mjs`, which is plain JavaScript because it is preloaded into whatever a
 * measured command spawns, and those processes have no TypeScript loader.
 *
 * Only the period is declared: it is the one thing outside the file reads, and `loop-blocks.ts`
 * subtracts it. The two copies are held equal by `loop-blocks.spec.ts`, which is the whole reason a
 * constant the language will not let us share only exists twice rather than drifting.
 */
export const TICK_MS: number;
