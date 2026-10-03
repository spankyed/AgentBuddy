// Every flag `npm run chain` accepts, as data.
//
// Its own module for the reason `chain-steps.ts` and `chain-schedule.ts` are: `scripts/chain.ts` runs the
// chain when imported, so nothing may import it to ask a question — and the question here is one nothing
// could ask before. `--cores` shipped undocumented, and `--record` and `--force` still are; the chain read
// its flags with `process.argv.includes`, which accepts anything and reports nothing, so
// `npm run chain -- --lanez 3` ran a full chain while silently ignoring what it was told.
//
// `chain-flags.spec.ts` holds this list to the root `CLAUDE.md`, which is the only other place the flags
// are written down. That check is free in chain time: `fingerprintUnit` keeps every `CLAUDE.md` out of
// every step's cache key by name.

/**
 * The flags, in the shape `parseFlags` takes them — without their leading `--`.
 *
 * `parseFlags` refuses a flag that is not here, which is the point of declaring them: the hand-rolled
 * reads it replaced could not tell a typo from an absence. The repo's argument for that refusal is in
 * `measure.ts`, written after the same bug printed a citation claiming a load that never happened.
 */
export const CHAIN_FLAGS = {
  values: ['cores'],
  booleans: ['all', 'dry', 'e2e', 'no-classify', 'record', 'force'],
} as const;

/** Each flag as it is written on a command line and in the docs */
export const chainFlagNames = (): string[] =>
  [...CHAIN_FLAGS.values, ...CHAIN_FLAGS.booleans].map((name) => `--${name}`).sort();
