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
  readonly dependsOn: readonly string[];
  /**
   * Steps this one may not run beside, by name — derived from what each writes (`conflictsOf`).
   *
   * Named rather than a boolean, which is what replaced it: `exclusive: true` held *every* lane, so a step
   * conflicting with one other blocked the nine it did not. Where the conflict really is global the set
   * says so, and the scheduler does the same thing for a reason it can print.
   */
  readonly conflicts?: readonly string[];
  /**
   * What of the machine this step takes — `coresFor` (`core-budget.ts`) resolves it from the share that
   * module declares.
   *
   * Absent is one core, which is most steps: a `tsc` leg is one process and nineteen of the chain's steps
   * are one. A resolved number rather than that share, so a case can schedule a graph of weights with no
   * machine behind it, and so this module goes on knowing nothing about pools.
   */
  readonly cores?: number;
  readonly seconds?: number;
}

export interface ScheduleOptions<S extends SchedulableStep> {
  readonly steps: readonly S[];
  /**
   * Cores the steps running together may take, summing their `cores`. One is serial.
   *
   * **The only limit, and it replaced a count of steps.** A count metered a single-threaded `tsc` leg and
   * a nine-worker vitest pool as one unit each, which is two different machines wearing one number;
   * measured 2026-10-02, admitting on cores instead took the chain from a median 202.8s to 169.4s and
   * halved its spread. A budget of one admits the first ready step and nothing beside it, which is what
   * the old single-lane diagnostic was for.
   */
  readonly budget: number;
  /**
   * Asked once a step's needs are met and before it is admitted, so a step that does not run costs no
   * budget. It counts as passed, and the steps that need it become ready.
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
  /**
   * What overlapped each step that took a lane — recorded, because only this loop knows it.
   *
   * It exists for one question: a failed step is re-run alone to tell its code apart from contention, and
   * that is worth doing only if something *was* running beside it. The chain used to predict the answer
   * from the step's declared mutexes, which stopped being the same question when `exclusive: true` became a
   * derived `conflictsOf`: a step with one mutex partner still runs beside two dozen others, and twelve of
   * them skipped the re-run on that reasoning.
   *
   * Both directions are recorded at dispatch, so this is "overlapped at any point" rather than a snapshot
   * at one instant — a peer that had already finished when the step failed still counts, which is the whole
   * point of asking.
   */
  readonly peers: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Runs the graph. A step starts when every step it needs has passed, the budget has room for what it
 * takes, and nothing it conflicts with is running. After a failure nothing new is dispatched and whatever
 * is running is awaited, so the run ends with no orphaned work — and steps that needed the failed one
 * never run, which is why this returns rather than throwing: the caller reports, and the caller decides.
 *
 * The conflict clause used to read "no exclusive step is running", which named a boolean field deleted
 * when mutexes became derived from what each step writes. A summary describing a flag that is not there
 * is worse than none, because it reads as the authority.
 *
 * **This never throws, including when `run` does.** A rejected `run` used to escape the loop immediately,
 * which abandoned everything else in flight: its step kept running, finished unobserved, and the caller
 * died on an unhandled rejection with child processes still alive. A throw is now that step failing, so
 * the same draining path applies to it as to a step that returned false.
 */
export async function schedule<S extends SchedulableStep>({ steps, budget, skip, run }: ScheduleOptions<S>): Promise<ScheduleResult> {
  const waiting = new Set(steps.map((step) => step.name));
  const done = new Set<string>();
  const running = new Map<string, Promise<string>>();
  const started: string[] = [];
  const skipped: string[] = [];
  const peers = new Map<string, Set<string>>();
  // Not `running`, which holds a step from the moment its promise resolves until the race hands its name
  // back — a window in which a finished step would be recorded as overlapping the next one dispatched
  const live = new Set<string>();
  /** Cores the live steps hold, kept beside `live` so admission is a comparison and not a sum per candidate */
  let spent = 0;
  let failed: string | undefined;
  const threw: { step: string; error: unknown }[] = [];

  while (waiting.size > 0 || running.size > 0) {
    if (failed === undefined) {
      for (const step of steps) {
        if (!waiting.has(step.name)) continue;
        if (!step.dependsOn.every((need) => done.has(need))) continue;
        // A mutex is symmetric: this step may not start beside one it conflicts with, and may not start
        // if a running step names it. Checked both ways rather than trusting the derivation to be
        // symmetric, since a one-sided conflict would silently let the pair overlap.
        const clashes = (name: string): boolean =>
          (step.conflicts ?? []).includes(name)
          || (steps.find((candidate) => candidate.name === name)?.conflicts ?? []).includes(step.name);
        if ([...running.keys()].some(clashes)) continue;
        // `continue`, never `break`: a one-core leg must not wait behind a nine-core pool that happens to
        // sit earlier in the table. A count of steps could `break` safely, because every candidate wanted
        // the same one slot; a budget cannot, because the next candidate may fit where this one does not.
        //
        // **`spent > 0` is what makes the budget soft, and it is not a nicety.** A step wider than the whole
        // budget fits nowhere, so a hard comparison would hold it forever, and this loop exits when nothing
        // is running and nothing was dispatched — the step would never run and the chain would report green
        // over it. One step may always exceed the budget alone; nothing may join it.
        if (spent > 0 && spent + (step.cores ?? 1) > budget) continue;

        waiting.delete(step.name);
        if (skip(step)) {
          skipped.push(step.name);
          done.add(step.name);
          continue;
        }
        started.push(step.name);
        // Both directions, now, while `live` is exactly what this step is about to join
        peers.set(step.name, new Set(live));
        for (const name of live) peers.get(name)?.add(step.name);
        live.add(step.name);
        spent += step.cores ?? 1;
        running.set(step.name, run(step).then(
          (passed) => {
            live.delete(step.name);
            spent -= step.cores ?? 1;
            if (passed) done.add(step.name);
            else failed ??= step.name;
            return step.name;
          },
          (error: unknown) => {
            live.delete(step.name);
            spent -= step.cores ?? 1;
            threw.push({ step: step.name, error });
            failed ??= step.name;
            return step.name;
          },
        ));
      }
    }
    // Nothing running and nothing dispatched means the rest depends on a step that failed, or on nothing
    // this loop can satisfy. Either way there is no one left to wait for.
    if (running.size === 0) break;
    running.delete(await Promise.race(running.values()));
  }

  return { started, skipped, threw, peers, ...(failed === undefined ? {} : { failed }) };
}
