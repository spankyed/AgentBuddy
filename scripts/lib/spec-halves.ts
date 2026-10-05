/**
 * Which half a spec runs in, and which vitest config that half is.
 *
 * A spec's half is a decision, declared by its filename: `.integration.spec.ts` or not. It picks the config
 * that runs the file, and `sizeOf` (`test-timeouts.ts`) derives a timeout budget from it, so this is
 * load-bearing well beyond any one command — `chain-steps.ts`' `INTEGRATION_SUITES` is
 * `UNIT_SUITES.filter(hasSplit)`, which is the whole chain's view of which suites have an expensive half.
 *
 * **It used to be derived from a measured cost, and is not any more.** `spec-cost.json` recorded what every
 * spec cost in milliseconds and a gate moved a file across an edge; that went because the quantity is not
 * one number — a spec read 2.8s in the fast pool and 0.64s in the integration pool, so each half's reading
 * demanded a move the other took back. What survives here is the part that was never measured.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const INTEGRATION_SUFFIX = '.integration.spec.ts';

/**
 * The two halves, as one declaration: the list is the definition and the type is derived from it.
 *
 * Written twice, a consumer that iterates the halves and a consumer that switches on them disagree the day a
 * third is added — the failure the root `CLAUDE.md` records for `PackRuleKey`, `APP_ENVS` and `ALL_COLORS`.
 * `CONFIG_BY_HALF` below is keyed by the type, so a half with no config is a compile error rather than a
 * lookup that returns undefined.
 */
export const HALVES = ['fast', 'integration'] as const;
export type Half = (typeof HALVES)[number];

export const halfOfPath = (file: string): Half => (file.endsWith(INTEGRATION_SUFFIX) ? 'integration' : 'fast');

/**
 * Which config runs each half, as one declaration rather than two lists that can disagree.
 *
 * `configsFor` derives its order from this, and a spec's path derives its config from it the other way
 * round, which is what lets a command act on the half a named spec lives in rather than the whole suite.
 */
export const CONFIG_BY_HALF: Readonly<Record<Half, string>> = {
  fast: 'vitest.config.ts',
  integration: 'vitest.integration.config.ts',
};

/**
 * The vitest configs a package runs its specs under, read from the package rather than assumed.
 *
 * Three packages have two — `@abuddy/cli`, `@app/repo-checks`, `@app/publish-checks` — and the other nine
 * have one.
 */
export function configsFor(packageDir: string): string[] {
  return Object.values(CONFIG_BY_HALF).filter((file) => fs.existsSync(path.join(packageDir, file)));
}

/**
 * Whether a package has a second half at all.
 *
 * A package with one config has nowhere to move a spec to, which is why nine of the twelve could never act
 * on the placement finding the deleted cost record used to raise. It is still the question
 * `chain-steps.ts` asks to build `INTEGRATION_SUITES`.
 */
export const hasSplit = (packageDir: string): boolean => configsFor(packageDir).length > 1;
