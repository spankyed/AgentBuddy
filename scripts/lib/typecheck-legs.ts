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
  readonly needs: readonly string[];
  /**
   * What it costs alone, measured 2026-09-27 on an idle machine. It feeds `budgetFor`, which bounds a leg at
   * four times this and floors at 60s — so the short legs all land on the floor, which is the right bound for
   * them anyway. Re-measure rather than raise one: a bound nobody will wait for is the same as no bound.
   */
  readonly seconds: number;
}

/** The one ordering constraint: three legs below read what it builds */
const ENSURE = 'packages:ensure';

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
  { name: ENSURE, command: 'npm run packages:ensure', needs: [], seconds: 0.3 },
  { name: 'typecheck:fe', command: 'npm run typecheck:fe', needs: [ENSURE], seconds: 6.2 },
  { name: 'typecheck:be', command: 'npm run typecheck:be', needs: [ENSURE], seconds: 3.4 },
  { name: 'typecheck:ears', command: 'npm run typecheck:ears', needs: [ENSURE], seconds: 0.8 },
  { name: 'typecheck:sdk', command: 'npm run typecheck:sdk', needs: [ENSURE], seconds: 1.1 },
  { name: 'typecheck:host', command: 'npm run typecheck:host', needs: [ENSURE], seconds: 1.3 },
  { name: 'typecheck:ui', command: 'npm run typecheck:ui', needs: [ENSURE], seconds: 2.0 },
  { name: 'check:specifiers', command: 'npm run check:specifiers', needs: [ENSURE], seconds: 2.7 },
  { name: 'exports:check', command: 'npm run exports:check -w @abuddy/ui', needs: [ENSURE], seconds: 0.1 },
  { name: 'schema:check', command: 'npm run schema:check -w @abuddy/sdk', needs: [ENSURE], seconds: 0.1 },
  { name: 'api:stamp', command: 'npm run api:stamp', needs: [ENSURE], seconds: 0.7 },
  { name: 'typecheck:scripts', command: 'npm run typecheck:scripts', needs: [ENSURE], seconds: 2.6 },
  { name: 'typecheck:cli', command: 'npm run typecheck:cli', needs: [ENSURE], seconds: 2.7 },
  { name: 'typecheck:pack', command: 'npm run typecheck:pack', needs: [ENSURE], seconds: 4.8 },
  { name: 'check:tiers', command: 'npm run check:tiers', needs: [ENSURE], seconds: 0.3 },
  { name: 'lint:check', command: 'npm run lint:check', needs: [ENSURE], seconds: 1.7 },
];
