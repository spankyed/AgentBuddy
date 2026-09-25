/**
 * Running a step graph with a lane limit, and the longest path through it.
 *
 * Separate from `scripts/chain.ts` for the same reason `chain-steps.ts` is: that module runs the chain when
 * imported, so nothing there can be tested. This is the riskiest logic the chain has — a scheduler can
 * deadlock, leak a lane, or keep dispatching after a failure, and none of those show up in a timing run that
 * happens to pass. Here they are a spec with a fake runner.
 */

/** What the scheduler needs of a step; `ChainStep` satisfies it */
export interface SchedulableStep {
  readonly name: string;
  readonly needs: readonly string[];
  /** Runs alone, holding every lane: it takes a lock the others would then queue behind */
  readonly exclusive?: true;
  readonly seconds?: number;
}

export interface ScheduleOptions<S extends SchedulableStep> {
  readonly steps: readonly S[];
  /** How many steps may run at once. One is serial. */
  readonly lanes: number;
  /**
   * Asked once a step's needs are met and before it takes a lane, so a step that does not run costs no lane
   * time. It counts as passed, and the steps that need it become ready.
   */
  readonly skip: (step: S) => boolean;
  /** Runs the step; `false` fails it. A failure stops new dispatches and lets running steps finish. */
  readonly run: (step: S) => Promise<boolean>;
}

export interface ScheduleResult {
  /** The steps that took a lane, in the order they started */
  readonly started: readonly string[];
  /** The steps `skip` answered true for */
  readonly skipped: readonly string[];
  /** The first step to fail, if one did */
  readonly failed?: string;
}

/**
 * Runs the graph. A step starts when every step it needs has passed, a lane is free, and no exclusive step
 * is running. After a failure nothing new is dispatched and whatever is running is awaited, so the run ends
 * with no orphaned work — and steps that needed the failed one never run, which is why this returns rather
 * than throwing: the caller reports, and the caller decides.
 */
export async function schedule<S extends SchedulableStep>({ steps, lanes, skip, run }: ScheduleOptions<S>): Promise<ScheduleResult> {
  const waiting = new Set(steps.map((step) => step.name));
  const done = new Set<string>();
  const running = new Map<string, Promise<string>>();
  const started: string[] = [];
  const skipped: string[] = [];
  let exclusiveRunning = false;
  let failed: string | undefined;

  while (waiting.size > 0 || running.size > 0) {
    if (failed === undefined) {
      for (const step of steps) {
        if (!waiting.has(step.name)) continue;
        if (running.size >= lanes) break;
        if (!step.needs.every((need) => done.has(need))) continue;
        if (exclusiveRunning || (step.exclusive && running.size > 0)) break;

        waiting.delete(step.name);
        if (skip(step)) {
          skipped.push(step.name);
          done.add(step.name);
          continue;
        }
        started.push(step.name);
        if (step.exclusive) exclusiveRunning = true;
        running.set(step.name, run(step).then((passed) => {
          if (passed) done.add(step.name);
          else failed ??= step.name;
          if (step.exclusive) exclusiveRunning = false;
          return step.name;
        }));
      }
    }
    // Nothing running and nothing dispatched means the rest depends on a step that failed, or on nothing
    // this loop can satisfy. Either way there is no one left to wait for.
    if (running.size === 0) break;
    running.delete(await Promise.race(running.values()));
  }

  return { started, skipped, ...(failed === undefined ? {} : { failed }) };
}

/**
 * The longest chain of steps by `seconds`: the floor on wall time however many lanes there are. Reported so
 * a disappointing parallel run is legible — if the critical path is most of the serial total, lanes were
 * never going to help, which is an answer rather than a tuning problem.
 */
export function criticalPath<S extends SchedulableStep>(steps: readonly S[]): { names: string[]; seconds: number } {
  const byName = new Map(steps.map((step) => [step.name, step]));
  const memo = new Map<string, { names: string[]; seconds: number }>();
  const walk = (step: S): { names: string[]; seconds: number } => {
    const seen = memo.get(step.name);
    if (seen) return seen;
    // Undefined rather than a zero, so a need that costs nothing still lands on the path. Seeding this with
    // `{ seconds: 0 }` drops every unmeasured step from the report, since nothing is greater than zero.
    let longest: { names: string[]; seconds: number } | undefined;
    for (const need of step.needs) {
      // A need outside `steps` contributes nothing: this is called with the steps that actually ran, and one
      // that was cached cost no time, so it is on no path worth reporting
      const needed = byName.get(need);
      if (!needed) continue;
      const path = walk(needed);
      if (!longest || path.seconds > longest.seconds) longest = path;
    }
    const before = longest ?? { names: [], seconds: 0 };
    const here = { names: [...before.names, step.name], seconds: before.seconds + (step.seconds ?? 0) };
    memo.set(step.name, here);
    return here;
  };
  return steps.map(walk).reduce((best, path) => (path.seconds > best.seconds ? path : best), { names: [] as string[], seconds: 0 });
}
