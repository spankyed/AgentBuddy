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

/**
 * Every spec a package owns, relative to the package.
 *
 * Both `tests/` and `src/`, and `src/` is now a net rather than a necessity. It was there because
 * `@app/default-setup` ran six colocated specs and walking only `tests/` reported them as
 * recorded-but-gone; those moved under `tests/` and no package colocates any more. Keeping the walk is
 * what stops the next one being silent twice over: no config includes `src/**` now, so such a spec would
 * never run, and if this did not see it the record would not report it missing either. As it is, it lands
 * here with no measured cost and nothing reported it. `spec-dry.ts` is the consumer now: it is how a whole-suite run lists the specs it
 * would execute, which used to be read from the deleted cost record.
 *
 * Ignoring what a package builds keeps the walk to sources: `dist` holds compiled copies, and `etc` holds
 * recorded artifacts rather than specs.
 */
// `templates` holds the CLI's scaffold: `templates/pack/tests/*.spec.ts` is a spec a pack author will run,
// not one of this package's, and vitest's own `include` already leaves it out
const IGNORED = new Set(['node_modules', 'dist', 'etc', 'coverage', 'templates']);
export function specFiles(packageDir: string): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('.') || IGNORED.has(entry.name)) return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(spec|test)\.ts$/.test(entry.name) ? [path.relative(packageDir, full)] : [];
    });
  return walk(packageDir).sort();
}
