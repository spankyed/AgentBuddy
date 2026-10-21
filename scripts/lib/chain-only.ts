// `npm run chain -- --only <steps>` and `--shard k/N`: running part of the chain in one job, as data.
//
// Its own module for the reason `chain-flags.ts` is: `scripts/chain.ts` runs the chain when imported, so the
// decisions live here where a spec can ask them.

/** One shard of a pool's specs, as vitest's `--shard` takes it: 1-based, `index <= total` */
export interface Shard { readonly index: number; readonly total: number }

export function parseShard(value: string): Shard {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  const [index, total] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  if (!match || index > total) throw new Error(`--shard takes k/N with 1 <= k <= N, not '${value}'`);
  return { index, total };
}

export const shardArg = (shard: Shard): string => `--shard=${shard.index}/${shard.total}`;

interface Selectable { readonly name: string; readonly dependsOn: readonly string[] }

/**
 * The named steps alone, with their edges to steps outside the selection removed.
 *
 * A producer left out is one whose outputs another job made, so it has to be current *here* before anything
 * that reads it runs: `whyNotCurrent` answers that for one producer (null when current), and any answer is a
 * refusal naming the step that needs it. Running against outputs that are missing or stale would pass over
 * nothing, which is the failure a split gate is most likely to hide.
 */
export function selectOnly<T extends Selectable>(steps: readonly T[], names: readonly string[],
  whyNotCurrent: (producer: string) => string | null): T[] {
  const wanted = new Set(names);
  const unknown = names.filter((name) => !steps.some((step) => step.name === name));
  if (unknown.length > 0) throw new Error(`--only names no chain step: ${unknown.join(', ')}`);
  const chosen = steps.filter((step) => wanted.has(step.name));
  const refusals: string[] = [];
  for (const step of chosen) {
    for (const producer of step.dependsOn.filter((need) => !wanted.has(need))) {
      const why = whyNotCurrent(producer);
      if (why !== null) refusals.push(`${step.name} reads ${producer}, which is not current here (${why})`);
    }
  }
  if (refusals.length > 0) {
    throw new Error(`--only refused: run the producers first, or download their outputs and stamps:\n  ${refusals.join('\n  ')}`);
  }
  return chosen.map((step) => ({ ...step, dependsOn: step.dependsOn.filter((need) => wanted.has(need)) }));
}

/**
 * The jobs of the strict gate, which runs the chain as parallel CI jobs (`.github/workflows/strict-chain.yml`).
 *
 * Derived from the graph rather than listed, so a step added to the table lands in a job without an edit to
 * the workflow: `producers` is everything the two expensive pools transitively read, `integration` and
 * `native` are those pools, and `rest` is the remainder, which reads the producers' outputs as well.
 */
export const STRICT_JOBS = ['producers', 'integration', 'native', 'rest'] as const;
export type StrictJob = (typeof STRICT_JOBS)[number];

export const POOL_JOBS: Readonly<Record<'integration' | 'native', string>> = {
  integration: 'test:integration',
  native: 'test:native',
};

/**
 * `typecheckLegs` joins the producers because `dep-files.integration.spec.ts` reads the build infos those legs
 * write, and no step declares them as outputs, so the graph alone cannot place them before the pool.
 */
export function strictJobSteps(steps: readonly Selectable[], job: StrictJob, typecheckLegs: readonly string[]): string[] {
  const byName = new Map(steps.map((step) => [step.name, step]));
  const legs = typecheckLegs.filter((name) => byName.has(name));
  const producers = new Set<string>(legs);
  const visit = (name: string): void => {
    for (const need of byName.get(name)?.dependsOn ?? []) {
      if (producers.has(need)) continue;
      producers.add(need);
      visit(need);
    }
  };
  for (const leg of legs) visit(leg);
  for (const pool of Object.values(POOL_JOBS)) visit(pool);
  const pools = new Set(Object.values(POOL_JOBS));
  if (job === 'producers') return steps.map((step) => step.name).filter((name) => producers.has(name));
  if (job === 'integration' || job === 'native') return [POOL_JOBS[job]];
  return steps.map((step) => step.name).filter((name) => !producers.has(name) && !pools.has(name));
}
