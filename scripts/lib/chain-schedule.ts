/**
 * Running a step graph with a lane limit.
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
  /** The first step to fail, if one did — whether it returned false or threw */
  readonly failed?: string;
  /**
   * What `run` threw, per step. A throw is a bug in the runner rather than a failing check, so it is
   * reported separately instead of being folded into `failed` alone.
   */
  readonly threw: ReadonlyArray<{ readonly step: string; readonly error: unknown }>;
}

/**
 * Runs the graph. A step starts when every step it needs has passed, a lane is free, and no exclusive step
 * is running. After a failure nothing new is dispatched and whatever is running is awaited, so the run ends
 * with no orphaned work — and steps that needed the failed one never run, which is why this returns rather
 * than throwing: the caller reports, and the caller decides.
 *
 * **This never throws, including when `run` does.** A rejected `run` used to escape the loop immediately,
 * which abandoned every other lane: its step kept running, finished unobserved, and the caller died on an
 * unhandled rejection with child processes still alive. A throw is now that step failing, so the same
 * draining path applies to it as to a step that returned false.
 */
export async function schedule<S extends SchedulableStep>({ steps, lanes, skip, run }: ScheduleOptions<S>): Promise<ScheduleResult> {
  const waiting = new Set(steps.map((step) => step.name));
  const done = new Set<string>();
  const running = new Map<string, Promise<string>>();
  const started: string[] = [];
  const skipped: string[] = [];
  let exclusiveRunning = false;
  let failed: string | undefined;
  const threw: { step: string; error: unknown }[] = [];

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
        running.set(step.name, run(step).then(
          (passed) => {
            if (passed) done.add(step.name);
            else failed ??= step.name;
            return step.name;
          },
          (error: unknown) => {
            threw.push({ step: step.name, error });
            failed ??= step.name;
            return step.name;
          },
        ).finally(() => {
          // In `finally` rather than on the success path, so the lane is released however the step ended.
          // Not observable today — a throw sets `failed`, and nothing is dispatched after that, so no step
          // ever waits on this flag again — and deliberately not covered by a test for that reason. It
          // becomes load-bearing the moment the chain gains a keep-going mode that dispatches past a
          // failure, which is exactly when a leaked exclusive flag would deadlock the rest.
          if (step.exclusive) exclusiveRunning = false;
        }));
      }
    }
    // Nothing running and nothing dispatched means the rest depends on a step that failed, or on nothing
    // this loop can satisfy. Either way there is no one left to wait for.
    if (running.size === 0) break;
    running.delete(await Promise.race(running.values()));
  }

  return { started, skipped, threw, ...(failed === undefined ? {} : { failed }) };
}
