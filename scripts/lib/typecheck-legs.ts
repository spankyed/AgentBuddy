// What `npm run typecheck` runs, as data.
//
// Separate from `scripts/typecheck.ts` for the same reason `chain-steps.ts` is separate from `chain.ts`: that
// module runs the checks when imported, so nothing may import it to ask a question. `chain-inputs.spec.ts`
// asks one — whether anything in the chain runs `schema:check` and `exports:check`, which are reachable only
// through here — and importing the runner for that answer cost 11s of collection time before this split.

export interface Leg {
  /** What `npm run` calls it, and what a failure is reported as */
  readonly name: string;
  /** Spelled out rather than derived — see the header */
  readonly command: string;
  /**
   * What this leg checks: the workspace directories it compiles, or `'repo'` where it walks the tree.
   *
   * **Declared, with the script as its check.** The scope could be parsed out of `command` — most legs
   * name their workspace with `--workspace`, and two name a directory with `tsc -p` — but a cache key
   * built on a shell-text parse fails silently when the parse is wrong, and this repo already keeps one
   * text scan it wants rid of for that reason. So the scope is a statement of intent and
   * `typecheck-legs.spec.ts` holds it to what the script names, which is the same shape as `needsApp`:
   * declared tag, derived check.
   *
   * `'repo'` is not a gap in that. A leg that walks the whole tree — the lint, the import rules, the tier
   * check — has no narrower scope to report, and saying so is the answer rather than the absence of one.
   */
  readonly scope: readonly string[] | 'repo';
  /**
   * What it costs alone, measured 2026-09-27 on an idle machine. It feeds `budgetFor`, which bounds a leg at
   * four times this and floors at 60s — so the short legs all land on the floor, which is the right bound for
   * them anyway. Re-measure rather than raise one: a bound nobody will wait for is the same as no bound.
   */
  readonly seconds: number;
}

/** The one ordering constraint: every other leg reads what it builds */
export const ENSURE = 'packages:ensure';

/**
 * Every leg, in the order a failure is reported in — which is this order and not the order they finish, so a
 * run reads the same way twice.
 *
 * `packages:ensure` first because `check:specifiers`, `api:stamp` and `typecheck:pack` read the built packages.
 * Everything else is independent, and that is the claim this file makes by running them at once: nothing here
 * writes what another leg reads. The checks are all `--check`/`--noEmit` halves, which is what makes that
 * plausible, and `--lanes 1` is how to test it if a leg ever starts behaving differently in company.
 */
export const TYPECHECK_LEGS: readonly Leg[] = [
  { name: ENSURE, command: 'npm run packages:ensure', scope: ['abuddy-ears', 'abuddy-sdk', 'abuddy-ui', 'abuddy-cli', 'abuddy-testing'], seconds: 0.3 },
  { name: 'typecheck:fe', command: 'npm run typecheck:fe', scope: ['renderer'], seconds: 6.2 },
  { name: 'typecheck:be', command: 'npm run typecheck:be', scope: ['api'], seconds: 3.4 },
  { name: 'typecheck:ears', command: 'npm run typecheck:ears', scope: ['abuddy-ears'], seconds: 0.8 },
  { name: 'typecheck:sdk', command: 'npm run typecheck:sdk', scope: ['abuddy-sdk'], seconds: 1.1 },
  { name: 'typecheck:host', command: 'npm run typecheck:host', scope: ['abuddy-host'], seconds: 1.3 },
  { name: 'typecheck:ui', command: 'npm run typecheck:ui', scope: ['abuddy-ui'], seconds: 2.0 },
  { name: 'check:specifiers', command: 'npm run check:specifiers', scope: 'repo', seconds: 2.7 },
  { name: 'exports:check', command: 'npm run exports:check', scope: ['abuddy-ui'], seconds: 1 },
  { name: 'schema:check', command: 'npm run schema:check', scope: ['abuddy-sdk'], seconds: 0.1 },
  { name: 'api:stamp', command: 'npm run api:stamp', scope: 'repo', seconds: 0.7 },
  { name: 'typecheck:scripts', command: 'npm run typecheck:scripts', scope: 'repo', seconds: 2.6 },
  { name: 'typecheck:cli', command: 'npm run typecheck:cli', scope: ['abuddy-cli', 'abuddy-testing'], seconds: 2.7 },
  { name: 'typecheck:pack', command: 'npm run typecheck:pack', scope: ['default-setup'], seconds: 4.8 },
  { name: 'typecheck:main', command: 'npm run typecheck:main', scope: ['main'], seconds: 1.0 },
  { name: 'typecheck:preload', command: 'npm run typecheck:preload', scope: ['preload'], seconds: 0.8 },
  { name: 'check:tiers', command: 'npm run check:tiers', scope: 'repo', seconds: 0.3 },
  { name: 'lint:check', command: 'npm run lint:check', scope: 'repo', seconds: 1.7 },
];
