// What of the machine each chain step takes, so one scheduler can admit them on cores.
//
// The chain has had a scheduler for steps since `chain-schedule.ts` and none for cores: `--lanes 3` meters
// a single-threaded `tsc` leg and a nine-worker vitest pool as one unit each. Measured 2026-10-02 on a
// 10-core box, that is 3 of 10 cores through the typecheck phase and 18 workers on 10 through the test
// phase — the same two-schedulers problem `chain-steps.ts` names over `TYPECHECK_STEPS`, which flattening
// the legs fixed for their *scheduling* and left standing for the pools' *sizing*.
//
// **Nothing here imposes a width; every entry describes one.** `test:integration` caps itself in its own
// config and the two unit pools take vitest's default. Those configs stay literal, which they have to:
// `check:specifiers` reads them as text and cannot read a computed value. So this table is a second record
// of a fact, and the kind that re-takes its answer — `core-budget.spec.ts` holds every entry to the config
// it describes, so a cap that moves fails there rather than drifting from here.
//
// A **share** of the box rather than a core count, so an entry means the same thing on any machine and a
// case about it is not about the box it ran on.

import * as os from 'node:os';

/**
 * This machine's usable cores.
 *
 * `availableParallelism` rather than `cpus().length`, which counts the host's where this reads a
 * container's quota. `scripts/test-unit.ts` already chooses it the same way.
 */
export const box = (): number => os.availableParallelism?.() ?? os.cpus().length;

/**
 * A pool that sets no cap, and so takes vitest's default of one less than the box.
 *
 * Declared as the default rather than as a share, because `(cpus - 1) / cpus` is not one number: 0.9 on
 * ten cores, 0.875 on eight. What such an entry claims is that its config sets *nothing*, and that is the
 * half a check can hold it to.
 */
export const UNCAPPED = Symbol('vitest default: one less than the box');

export type PoolWidth = number | typeof UNCAPPED;

/**
 * What each step's inner pool takes. A step with no entry takes one core.
 *
 * Absent is the common case and the right one: nineteen of the twenty-nine steps are one `tsc` or one
 * `node`, and `SIZE_MS`'s precedent (`unit-suites.ts`) is that a list whose every entry is the same value
 * is one nobody maintains. An entry is a claim about a pool, and something has to stand behind it.
 *
 * **`build:app` and `compile` have no entry, so they weigh one core and are understated** — vite and
 * esbuild both fork. They are left out because nothing *declares* their width for an entry to be checked
 * against: it would be a measurement rather than a description, which is a sample, and a sample needs the
 * hysteresis and the busy-machine refusal `spec-cost.json` carries and this table does not. The condition
 * for adding them is the admission policy becoming the default rather than a flag.
 */
export const POOL_WIDTH: Readonly<Record<string, PoolWidth>> = {
  'test:unit:host': UNCAPPED,
  'test:unit:pack': UNCAPPED,
  'test:integration': 0.5,
};

/**
 * What a step takes of `cores`, which defaults to this machine's.
 *
 * The parameter is what lets a case ask about a ten-core box from an eight-core one. These are the
 * scheduler's weights, and a weight that moves with the machine is one no case can pin.
 */
export function coresFor(step: string, cores: number = box()): number {
  const width = POOL_WIDTH[step];
  if (width === undefined) return 1;
  if (width === UNCAPPED) return Math.max(1, cores - 1);
  return Math.max(1, Math.round(width * cores));
}

/** A share as vitest writes it in `poolOptions`, which is how a config and this table are compared */
export const asPercent = (share: number): string => `${Math.round(share * 100)}%`;
