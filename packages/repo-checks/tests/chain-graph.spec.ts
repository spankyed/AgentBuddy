// The pre-merge chain's run order is derived from what each step reads and writes — no step declares an
// edge — so what this pins is that the derivation is a topological sort and that a wrong graph fails before
// any step runs: a six-minute chain should not discover a cycle halfway through.
// What it does not pin is the derivation against the `needs` table it replaced: that snapshot existed for
// the one commit that deleted those fields and went with them, since keeping it would be a second record of
// the graph, able to disagree with the first. The property is what survives, here and in `chain-schedule`
// (two conflicting steps never overlap) and `chain-inputs` (the derived ancestors are walked).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, chainSteps, conflictsOf, dependsOn, orderedSteps, STEP_TABLES, type ChainStep } from '../../../scripts/lib/chain-steps.ts';
import { declaredAt } from '../../../scripts/lib/chain-output.ts';
import { withoutComments } from '../../../scripts/lib/npm-scripts.ts';
import { population } from '@abuddy/sdk/testing';
import { machineText, thisMachine } from '../../../scripts/lib/core-budget.ts';
import { ASSUMED_RUNGS, declaredShare, timedOutBecause, TIMEOUT_CLASSES, TIMEOUT_MS } from '../../../scripts/lib/step-timeouts.ts';

describe('the chain graph', () => {
  it('orders every step after the steps it depends on', () => {
    const order = orderedSteps().map((s) => s.name);
    expect(order).toHaveLength(CHAIN_STEPS.length);
    for (const step of CHAIN_STEPS) {
      for (const need of dependsOn(step)) {
        expect(order.indexOf(need), `${need} must come before ${step.name}`).toBeLessThan(order.indexOf(step.name));
      }
    }
  });

  it('derives the order rather than reading the table\'s, so a table in the wrong order still runs right', () => {
    // The table happens to be written in a valid order, so a sort that merely returned it would pass the test
    // above. Reversed, it is invalid — every step precedes what it needs — and the result must still be valid.
    const reversed = [...CHAIN_STEPS].reverse();
    const order = orderedSteps(reversed).map((s) => s.name);
    expect(order).toHaveLength(CHAIN_STEPS.length);
    for (const step of CHAIN_STEPS) {
      for (const need of dependsOn(step)) {
        expect(order.indexOf(need), `${need} must come before ${step.name}`).toBeLessThan(order.indexOf(step.name));
      }
    }
    expect(order).not.toEqual(reversed.map((s) => s.name));
  });

  /**
   * Two steps each reading what the other writes. A derived graph can still cycle — the derivation only
   * refuses to invent an edge, not to find a circular one — and a six-minute chain must not discover it
   * halfway through.
   */
  it('refuses a cycle', () => {
    const steps: ChainStep[] = [
      { name: 'a', timeout: 'quick', inputs: ['y'], outputs: ['x'] },
      { name: 'b', timeout: 'quick', inputs: ['x'], outputs: ['y'] },
    ];
    expect(() => orderedSteps(steps)).toThrow(/cycle/);
  });

  /**
   * **The same property, through the door the case above does not reach.** A two-step cycle leaves one
   * element in the reduction's candidate list, so its pairwise filter short-circuits and the transitive walk
   * is never called: that case exercises the topological sort and not the derivation. Give the cycle a step
   * with two producers and the walk runs, re-enters an answer still being computed, and the verdict used to
   * be `RangeError: Maximum call stack size exceeded` — a wrong graph failing, but not *naming itself*,
   * which is what the header above promises. Both shapes are kept because neither covers the other.
   */
  it('refuses a cycle reached through a step with two producers, naming it rather than overflowing', () => {
    const steps: ChainStep[] = [
      { name: 'a', timeout: 'quick', inputs: ['x', 'y'], outputs: ['z'] },
      { name: 'b', timeout: 'quick', inputs: ['z'], outputs: ['x'] },
      { name: 'c', timeout: 'quick', inputs: [], outputs: ['y'] },
    ];
    expect(() => orderedSteps(steps)).toThrow(/cycle through a/);
  });

  /**
   * A mutex has no direction, so this one is a preference — and it was held by nothing but the order the
   * two happen to sit in the table.
   *
   * `test:smoke` and `test` both write `tests/results`, which makes them a derived mutex: the scheduler will
   * not overlap them, and either order satisfies it. Running the six-second gate before the twenty-six
   * second harness is what anyone wants, and until this case existed, reordering the table would have
   * silently swapped them. Named here rather than declared on a step, because a preference between two
   * steps is not a property of either.
   */
  it('runs the smoke gate before the harness they are mutexed by', () => {
    const order = orderedSteps(chainSteps(['test'])).map((step) => step.name);
    expect(order, 'the opt-in harness is not in this plan, so there is nothing to order').toContain('test');
    const smoke = CHAIN_STEPS.find((step) => step.name === 'test:smoke')!;
    expect(conflictsOf(smoke), 'the two no longer share a path, so this preference has lost its subject')
      .toContain('test');
    expect(order.indexOf('test:smoke')).toBeLessThan(order.indexOf('test'));
  });

  /**
   * The E2E harness reads the published trees, so it may not run beside the step that rewrites them.
   *
   * `packages:check` runs `attw --pack`, which packs a tarball *inside* the tree it is checking, and
   * `stagePublishTree` removes and recreates that tree — while every E2E spec loads its fixture from
   * `@abuddy/testing`'s built bundle, which lives there. `test:smoke` declared those trees and was therefore
   * mutexed; `test` declared only the app's four dists, so the pair was kept apart by nothing but the order
   * the scheduler happened to pick. Asserted on `test` rather than left to the derivation, because what makes
   * the mutex exist is one declaration that is easy to drop.
   */
  it('keeps the harness away from the step that rewrites what it loads', () => {
    const harness = CHAIN_STEPS.find((step) => step.name === 'test')!;
    expect(conflictsOf(harness), 'the harness no longer declares the published trees it imports from')
      .toContain('packages:check');
  });

  /**
   * Every step can be pointed at, which is what lets a run print where its reasoning lives instead of
   * repeating it.
   *
   * Derived from `STEP_TABLES` rather than from one file, because that is the mistake this replaces:
   * `declaredIn` searched `chain-steps.ts` alone and silently found nothing for the seventeen typecheck legs
   * and the two pool steps, whose names are generated. Nothing noticed, because only a `neverCachedBecause`
   * step prints the pointer and both of those live in the file it did search — so the first leg to become
   * never-cached would have lost it. Drop a table from the list and this fails for seventeen steps.
   */
  it('declares every step somewhere a run can point at', () => {
    const sources = STEP_TABLES.map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'));
    expect(CHAIN_STEPS.length, 'the table emptied, so this would pass over nothing').toBeGreaterThan(25);
    const lost = CHAIN_STEPS.filter((step) => sources.every((source) => declaredAt(source, step.name) === undefined));
    expect(lost.map((step) => step.name), 'nothing names these, so a run cannot point at their reasoning').toEqual([]);
  });

  /**
   * And the line it lands on declares *that* step, which locatable does not say.
   *
   * The case above asks only whether an answer came back, and for the two steps whose names are generated an
   * answer comes from a prefix match — so a line that merely looks like a declaration would satisfy it. The
   * sibling in `chain-output.spec.ts` covers a never-cached step, which is every step that prints a pointer
   * today, and every one of those is written out literally; this is the half that holds the generated ones.
   * What it cannot check is specificity, which has no second generator to be wrong about — a written table
   * carries that case.
   */
  it('lands on a line that declares the step it was asked about', () => {
    const generated = CHAIN_STEPS.filter((step) => STEP_TABLES.every((file) =>
      !fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').includes(`name: '${step.name}'`)));
    expect(generated.map((step) => step.name), 'no step has a generated name, so this would pass over nothing')
      .toEqual(['test:unit:host', 'test:unit:pack']);
    for (const step of generated) {
      for (const file of STEP_TABLES) {
        const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
        const at = declaredAt(lines.join('\n'), step.name);
        if (at === undefined) continue;
        const prefix = /name: `([^$`]*)/.exec(lines[at - 1]!)?.[1];
        expect(prefix, `${file}:${at} is where ${step.name} was placed, and it declares no generated name`).toBeDefined();
        expect(step.name.startsWith(prefix!), `${file}:${at} generates names like ${prefix!}, which ${step.name} is not one of`).toBe(true);
      }
    }
  });

  it('refuses two steps with one name, which would make an edge ambiguous', () => {
    const steps: ChainStep[] = [{ name: 'a', timeout: 'quick', inputs: [] }, { name: 'a', timeout: 'quick', inputs: [] }];
    expect(() => orderedSteps(steps)).toThrow(/Two chain steps named a/);
  });

  /**
   * A step may go uncached for one of two reasons, and both are properties of the step rather than a name.
   *
   * Its pass is not reproducible — the E2E suite, which drives real Electron — or its *effect* is recorded
   * where `fingerprintUnit` cannot see it. `packages:ensure` is the second kind: what it guarantees is that
   * the built packages are current, and whether they are lives in `node_modules/.cache/abuddy-packages-build`,
   * which is neither among its inputs nor content-hashed as an output. Measured 2026-09-26: with those stamps
   * removed and `dist` still present, the step reported `cached` while `packagesBuiltOrRefuse()` refused, so
   * every step guarding on the built packages failed at collection — nested caches that can disagree, the
   * same class this branch fixed for the two unit pools.
   *
   * Written as the rule so a third uncached step has to earn it: anything that writes the package build
   * outputs cannot be cached on its inputs alone, and anything else needs a reason in the list below.
   */
  it('makes every uncached step say why in a sentence, which is what the chain prints for it', () => {
    expect(CHAIN_STEPS.filter((s) => s.neverCachedBecause !== undefined && s.neverCachedBecause.length < 20)
      .map((s) => s.name), 'an uncached step needs a reason, not a flag: the chain prints this where a cache '
      + 'verdict would go, and the line it replaced was hardcoded about Electron and wrong about the other '
      + 'step that opted out').toEqual([]);
  });

  /**
   * An opt-in step is declared but not gated on. The declarations are the reason it stays: `chain-inputs`
   * reads every step's `inputs` to prove the tracked tree is covered, so deleting the E2E step would leave
   * `tests/e2e` watched by nothing while looking like a simplification.
   */
  describe('a step the chain knows about but does not gate on', () => {
    it('is left out by default and put back when asked for', () => {
      const byDefault = chainSteps().map((s) => s.name);
      expect(byDefault, 'the E2E suite drives the app; it is not a regression gate').not.toContain('test');
      expect(chainSteps(['test']).map((s) => s.name), '`--e2e` runs it').toContain('test');
    });

    it('says why, as an uncached step has to', () => {
      expect(CHAIN_STEPS.filter((s) => s.optInBecause !== undefined && s.optInBecause.length < 20).map((s) => s.name),
        'an opt-in step needs a reason, not a flag').toEqual([]);
    });

    /**
     * The one way this breaks: something depends on a step the default run does not include, so the chain
     * is missing a dependency and finds out halfway through. It fails at the selector instead.
     *
     * Asked of `chainSteps` rather than `orderedSteps`, because that is the only place it can be asked
     * now. Edges derive from the list they are given, so a step filtered out of the list is simply not
     * depended on by it; the refusal has to derive against the *whole* table, which is what `chainSteps`
     * does and why it takes one.
     */
    it('refuses a graph where something depends on one', () => {
      const steps = CHAIN_STEPS.map((s) => (s.name === 'build:app' ? { ...s, optInBecause: 'for the case' } : s));
      expect(() => chainSteps([], steps))
        .toThrow(/depends on build:app, which is opt-in/);
    });
  });

  it('does not cache the step that guarantees the built packages', () => {
    expect(CHAIN_STEPS.find((s) => s.name === 'packages:ensure')!.neverCachedBecause,
      'it would cache on its inputs while what it guarantees is recorded in stamps the fingerprint cannot '
      + 'see. Measured: with those stamps cleared and dist still present, the step reported `cached` while '
      + 'packagesBuiltOrRefuse() refused, so every step reading the built packages failed at collection')
      .toBeDefined();
  });
});

describe('every spawn an orchestrator makes is bounded', () => {
  const REPO = REPO_ROOT;
  const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

  /**
   * The classes the repo's npm scripts bound a direct run at, from the manifest's text.
   *
   * Text rather than a resolved config, for `capsInText`'s reason (`core-budget.spec.ts`): what is being asked
   * is what the manifest *says*, and a pure function over it is what lets the scan be mutated rather than
   * trusted.
   */
  type Scripts = { scripts: Record<string, string> };
  const boundedIn = (scripts: Record<string, string>): { name: string; className: string }[] =>
    Object.entries(scripts).flatMap(([name, command]) =>
      [...command.matchAll(/scripts\/bounded\.ts\s+(\S+)/g)].map((hit) => ({ name, className: hit[1]! })));

  // An unbounded run cannot fail — it waits until a person notices and kills it by pid, which is how this
  // repo collected an orphaned build at 99% CPU for a day. `boundedSpawn` bounds the wall clock and kills
  // the process group rather than the child, so nothing outlives the run that started it.
  // Four files, not two: `typecheck.ts` and `test-unit-pool.ts` spawn as well, and both were missing from
  // this list while it read as the repo's answer to "does anything spawn unbounded".
  it.each(['scripts/chain.ts', 'scripts/test-unit.ts', 'scripts/typecheck.ts', 'scripts/test-unit-pool.ts'])(
    '%s spawns only through boundedSpawn', (file) => {
    const source = read(file);
    expect(source, `${file} imports spawn directly`).not.toMatch(/import \{[^}]*\bspawn\b[^}]*\} from 'node:child_process'/);
    expect(source).toContain('boundedSpawn');
  });

  /**
   * **No deadline anywhere is a function of a recorded measurement.** This is the greppable property
   * `docs/archive/plans/costs-across-machines.md` asks Phase 1 to end on, and it is greppable on purpose: the rule
   * is about a shape rather than a value, so a reader can check it and so can this.
   *
   * It was `budgetFor(seconds)` — four times a ten-core measurement — which made every kill deadline in the
   * repo this machine's deadline. A box with a third of the cores ran the same bound over a step three to
   * four times slower, and `test:unit:host` came out at 130-170s against a 168s deadline: a flake that reads
   * as a code failure.
   *
   * The shell scripts are in the population because they were the half that nearly got missed. Their bounds
   * are *inner*, nested inside the chain's, and two of the three were already the binding constraint — 90s
   * inside against 144s outside — so coarsening only the chain's would have changed nothing for them.
   *
   * **Two halves, because the negative one alone is weak.** Refusing `budgetFor(` catches the old shape
   * coming back and nothing else: someone writing `classFor(step.seconds)` passes it. So the positive half
   * asserts each of these files takes its bound from the ladder. What neither catches is a *new* function
   * that thresholds a cost into a class inside `step-timeouts.ts` itself — that one is a comment on
   * `TIMEOUT_MS`, and the edit to watch is the one that gives a step its class by comparing `seconds`.
   */
  it('sizes no deadline from a measurement, in any file that spawns or any script that bounds one', () => {
    const spawners = ['scripts/chain.ts', 'scripts/test-unit.ts', 'scripts/typecheck.ts',
      'scripts/test-unit-pool.ts', 'scripts/bounded.ts'];
    for (const file of population('the bounding files', spawners)) {
      // Comments stripped, because prose about the old rule is not the old rule — `withoutComments`, for the
      // reason it was written: a script explaining why it does *not* do a thing otherwise reads as doing it.
      // Three of these files name `budgetFor` in a sentence recording what it was.
      expect(withoutComments(read(file), false), `${file} derives a deadline from a cost; a class carries no machine`)
        .not.toMatch(/budgetFor\s*\(/);
    }
    // The positive half: the bound comes from the ladder rather than from anywhere else
    for (const file of spawners) {
      expect(read(file), `${file} spawns without taking its deadline from step-timeouts.ts`)
        .toContain('step-timeouts.ts');
    }
    // And the shell bounds name a class rather than a number of seconds, which is the same rule one layer out
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const numeric = Object.entries(scripts)
      .filter(([, command]) => /scripts\/bounded\.ts\s+\d/.test(command))
      .map(([name]) => name);
    expect(numeric, 'these bound a script with a number of seconds, which is a deadline from one machine')
      .toEqual([]);
  });

  // A shell script run through the chain is bounded by the step's budget, but the direct run is the one
  // people and agents use, and it had no bound at all. test-packaged-authoring.sh is why: its expect block
  // sets `timeout 120`, which covers a pattern match and not the `wait` after it, and it once hung a machine.
  it('every npm script that runs a shell script bounds it', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const unbounded = Object.entries(scripts)
      .filter(([, command]) => command.includes('tests/scripts/') && !command.includes('scripts/bounded.ts'))
      .map(([name]) => name);
    expect(unbounded, 'these run a shell script with no wall-clock budget').toEqual([]);
  });

  // Not for the budget any more — that is a declared class — but because the drift report compares a run
  // against this number, and a step with none is one no run can contradict
  it('every chain step declares what it costs healthy', () => {
    expect(CHAIN_STEPS.filter((step) => step.seconds === undefined).map((step) => step.name)).toEqual([]);
  });

  /**
   * Every step declares a timeout class, which is what actually bounds it.
   *
   * Required on the type, so this cannot fail by a step omitting one — what it catches is the other way, a
   * class that is not in the ladder, which `TIMEOUT_MS` answers `undefined` for. Since a rung became an
   * object that is a throw at the spawn rather than a deadline of NaN, which is the better failure and still
   * not one to discover six minutes into a chain. That is `unit-pool.spec.ts`' hazard moved to its new home.
   */
  it('bounds every step with a class the ladder has', () => {
    const unknown = CHAIN_STEPS.filter((step) => TIMEOUT_MS[step.timeout]?.ms === undefined);
    expect(unknown.map((step) => step.name), 'a class off the ladder has no deadline at all').toEqual([]);
  });

  /**
   * And no step has outgrown the rung it declares.
   *
   * **A bound, not a fit, and the difference is the whole reason this is allowed to exist.** The case above
   * about `budgetFor(` refuses *deriving* a class from a cost, and its comment names "the edit to watch" as
   * the one that gives a step its class by comparing `seconds` — that is still refused, and this is not it.
   * `goal-measured-placement.md` says it from the other side, quoted in `suite-split.spec.ts`: *a bound is
   * not a fit; deriving one from the measurement it bounds is how a timeout stops catching anything.* A
   * deadline here is still chosen by kind; this only notices when a step's cost has grown until its chosen
   * rung no longer has room, which is a question nothing else in the repo asks.
   *
   * **The fraction is derived, not picked, and since 2026-10-03 it is derived per rung.** A rung declares how
   * much its kind of work stretches on a smaller box, so a step at a fraction `f` of its class here sits at
   * `f × stretches` there; `declaredShare` is that product and 1 is exactly on the deadline. One global
   * fraction was answering three questions at once — the 4× is a measurement of a *pool* losing workers,
   * which describes `suite` and not the single compilers in `quick` — and two of the three rungs now say
   * outright that they are borrowing it (`ASSUMED_RUNGS`, and the case below).
   *
   * **It is a creep detector and it found nothing the day it was written, which is worth being honest
   * about.** A rung's own factor still permits a step to reach its deadline *exactly* on the machine that
   * rung is sized for, so this is the loosest useful bound rather than a comfortable one. It cannot be
   * tightened on the two borrowed rows without first measuring them, and a margin on top of today's figures
   * fails five steps, most of them single compilers the pool measurement does not describe.
   *
   * So the two steps that were genuinely tight — `packages:ensure` at 93% of its deadline four times slower,
   * `compile` at 87% — were found by reading the table, not by this, and moved because they are *bundles*
   * (`suite` is the rung that says "a test suite or a bundle") rather than the single compilers `quick`
   * describes. What this catches is the next one, as a declared cost grows.
   *
   * No exception list. At these factors nothing needs one, and the day something does, the answer is to move
   * the step or add a rung — not to write down that one step is allowed to be tight.
   */
  it('leaves every step room inside the class it declares, on the smaller machine that rung is sized for', () => {
    const tight = CHAIN_STEPS
      .map((step) => ({ step, at: declaredShare(step.seconds ?? 0, step.timeout) }))
      .filter(({ at }) => at > 1)
      .map(({ step, at }) => `${step.name} declares ${step.seconds}s, which is `
        + `${Math.round(at * 100)}% of ${step.timeout} (${TIMEOUT_MS[step.timeout].ms / 1000}s) on a machine `
        + `${TIMEOUT_MS[step.timeout].stretches} times slower`);
    expect(tight, 'move these to a longer class — a step past 100% of its rung on the machine that rung is'
      + ' sized for is one whose deadline is no longer a ceiling there').toEqual([]);
  });

  /**
   * And the same bound asked of a measurement lives in the chain, not here.
   *
   * This case can only ever see the declaration — a spec has no run to read. So a step whose *recorded* cost
   * has gone stale passes here while its real cost has outgrown the rung, and the band watching that record
   * (`driftedSteps`) is looser than this bound's own margin: `test:integration` could reach twice its declared
   * 60s, which is 1.60 of its rung, before anything said a word. `outgrownRungs` is the other half, asked of
   * what a run measured, and it is a report rather than a gate because a crowded measurement is noisy where a
   * declaration is not.
   *
   * Cross-referenced rather than duplicated: a reader who finds one needs to know the other exists, and the
   * two cannot be one check because neither has the other's input.
   */
  /**
   * The idle refusal comes before the run, which is the only order in which its answer is useful.
   *
   * `recordTheCosts` asks it at the end too, and both are needed — a box quiet now can be loaded by the end,
   * and the chain is its own load. What was missing was the early one: twice on 2026-10-04 an `--all --record`
   * spent 200 seconds and was then told the machine was 69% idle. `spec-cost:update` has always asked first,
   * and `suite-split.spec.ts` holds it to that with this same assertion — a command cannot be imported, so its
   * ordering is checked as text.
   */
  it('refuses a busy machine before spending the run, not only after it', () => {
    const source = read('scripts/chain.ts');
    const first = source.indexOf('refusesAsBusy(');
    expect(first, 'the chain asks whether the machine is quiet').toBeGreaterThan(-1);
    expect(first, 'before it starts the run, which is where the answer is worth having')
      .toBeLessThan(source.indexOf('await schedule({'));
    expect(source.lastIndexOf('refusesAsBusy('), 'and again at the end, since the run is its own load')
      .toBeGreaterThan(source.indexOf('await schedule({'));
  });

  it('names the measured counterpart of this bound, which only a run can ask', () => {
    const timing = read('scripts/lib/step-timing.ts');
    expect(timing, 'the measured half of the bound').toContain('export function outgrownRungs');
    expect(timing, 'weighed by the same rule, so the two cannot disagree about what "over" means')
      .toContain('declaredShare(');
    expect(read('scripts/chain.ts'), 'and a run reports it').toContain('outgrownRungs(');
  });

  /**
   * Which rungs' factors are measured, and that every one of them says which it is.
   *
   * **Exactly one of `measured` and `until`**, because the pair is an either/or written as two fields: a
   * measured rung still carrying a condition is a stale one, and an assumed rung without a condition is a
   * guess nobody wrote the terms of. Both were the state of the whole ladder until 2026-10-03, when one
   * global `SLOWER_MACHINE` stood for three rungs and nothing at any call site said which of the three it had
   * been measured for.
   *
   * It asserts that *some* rung is assumed rather than naming which. Two are today, and the day one is
   * measured this case should keep passing without an edit — what it is here to catch is a row with neither
   * answer or both.
   */
  it('says of every rung whether its stretch factor was measured, and what would settle it if not', () => {
    for (const className of population('the ladder', TIMEOUT_CLASSES)) {
      const { measured, until } = TIMEOUT_MS[className];
      expect([measured, until].filter((what) => what !== undefined), `${className} must record either what `
        + 'measured its stretch factor or what would, and never both').toHaveLength(1);
    }
    expect(ASSUMED_RUNGS.length, 'a ladder with nothing assumed needs no ASSUMED_RUNGS, and this case and '
      + "the message's off-machine arm are then both describing a state that cannot happen")
      .toBeGreaterThan(0);
  });

  /**
   * What a step says when its class killed it — the one report in the repo whose subject is a deadline.
   *
   * **A kill truncates the measurement**, so the figure with information in it is the *rope*: the deadline
   * over what the step costs healthy. Elapsed time is the deadline plus the grace period by construction
   * (`bounded-spawn.ts`) and carries nothing, which is why none of these cases asks for it.
   *
   * **And the interpretation is machine-dependent.** "So it is wedged" is true where the costs were measured
   * and an assertion the program cannot make anywhere else: on a smaller box a step can exceed its deadline
   * by being slow, and that is exactly the evidence the assumed rungs are waiting for. The message used to
   * state the conclusion flatly and then add *"overrunning one is not a stale number"* — the sentence that
   * would stop a reader suspecting the rung's factor, which off the measured machine is the thing to suspect.
   */
  describe('what a timed-out step reports', () => {
    const HERE = thisMachine();
    const SMALLER = { cpu: 'Some Smaller CPU', cores: 4 };

    it('states the rope it got, which is its deadline over what it costs healthy', () => {
      // 300s for a 13s step is 23x, and that is the number a kill proves a lower bound on
      expect(timedOutBecause({ what: 'compile', timeout: 'suite', seconds: 13, measuredOn: HERE }))
        .toContain('That is 23x the 13s it costs healthy here');
    });

    it('calls it wedged on the machine the costs were measured on', () => {
      const why = timedOutBecause({ what: 'compile', timeout: 'suite', seconds: 13, measuredOn: HERE });
      expect(why).toContain('so it is wedged rather than slow');
      expect(why, 'the deadline and its class, so a reader need not look the rung up').toContain('300s (suite)');
    });

    /**
     * The arm the whole change is for: off the measured machine the rope is evidence about the rung, and the
     * message has to name the rung's factor rather than draw the conclusion that forecloses it.
     */
    it('names the rung and its factor on any other machine, and calls the rope the finding', () => {
      const assumed = ASSUMED_RUNGS[0]!;
      const why = timedOutBecause({
        what: 'typecheck:fe', timeout: assumed, seconds: 10, measuredOn: HERE, machine: SMALLER,
      });
      expect(why, 'never the flat conclusion, which here is the half of the answer that is not knowable')
        .not.toContain('so it is wedged rather than slow');
      expect(why).toContain(`or ${assumed} stretches by more than`);
      expect(why).toContain(`which its row assumes is ${TIMEOUT_MS[assumed].stretches}x and has never measured`);
      expect(why, 'both machines, since the reader has to know which is which').toContain(machineText(SMALLER));
      expect(why).toContain(machineText(HERE));
    });

    it('says a measured rung was measured, and by what', () => {
      // `suite` is the one rung with a figure of its own, so off-machine it reports a recorded factor rather
      // than an assumption — the same arm, a different claim, and getting those two the same way round is the
      // point of carrying the provenance on the rung
      const why = timedOutBecause({
        what: 'test:integration', timeout: 'suite', seconds: 60, measuredOn: HERE, machine: SMALLER,
      });
      expect(why).toContain('where its row records');
      expect(why, 'the provenance itself, not a copy of it').toContain(TIMEOUT_MS.suite.measured);
    });

    /**
     * And the arm `scripts/bounded.ts` takes, which is the one that matters: that path has a class and an
     * argv and no step record at all, so a rope is not a number it can compute. It says so rather than
     * reaching for a `?` or a zero — the same refusal `priceSpecs` makes about an unrecorded spec.
     *
     * **It is gated on the machine like the other two, which took a correction.** The cost and the machine
     * were one optional argument, so the arm with no cost had no machine either and said "usually wedged
     * rather than slow" on any box — the one unconditional verdict left, in the arm four of the five call
     * sites can reach, and in the path most likely to be running on someone else's machine.
     */
    it('computes no rope where this run carries no recorded cost', () => {
      const why = timedOutBecause({ what: 'bash tests/scripts/x.sh', timeout: 'scenario', measuredOn: HERE });
      expect(why).toContain('900s (scenario)');
      expect(why).toContain('This run carries no recorded cost');
      expect(why, 'no rope, and no invented operand to compute one from')
        .not.toMatch(/That is \d+(?:\.\d+)?x/);
    });

    it('still calls an overrun wedged with no cost, on the machine the ladder is sized against', () => {
      const why = timedOutBecause({ what: 'bash tests/scripts/x.sh', timeout: 'scenario', measuredOn: HERE });
      expect(why).toContain('wedged rather than slow');
      // **And it names what that rests on**, which is `declaredShare` holding every *declared* cost inside
      // its rung. Without the premise the sentence denied a cost in one clause and reasoned from one in the
      // next; with it, a reader whose run has no declared cost anywhere can see they are outside the
      // guarantee rather than having to derive which callers it covers
      expect(why, 'the premise, not the bare verdict').toContain('every step the chain declares');
    });

    it('draws no conclusion with no cost on any other machine, where being slow is the other answer', () => {
      const why = timedOutBecause({
        what: 'bash tests/scripts/x.sh', timeout: 'scenario', measuredOn: HERE, machine: SMALLER,
      });
      expect(why, 'the verdict this change exists to stop it making').not.toContain('wedged rather than slow');
      expect(why).toContain('So it is wedged, or scenario stretches by more than');
      expect(why, 'both machines, so the reader knows which is which').toContain(machineText(SMALLER));
      expect(why).toContain(machineText(HERE));
    });

    /**
     * What an assumed rung tells the reader to do, which is to record the run rather than to make it.
     *
     * **This quoted `until` for one commit and that was circular by construction**, which is the property
     * the second assertion pins. `until` names a run that reaches the rung; this arm prints only off the
     * measured machine, so its reader is always on a box that can supply the evidence, and the message
     * exists because a run just reached that rung. It therefore always named the run the reader had just
     * made. The edit named instead is the one the provenance case polices as exactly one of `measured` and
     * `until`, so the two cases cannot drift apart about what settling a rung means.
     */
    it('tells an assumed rung\'s reader to record this run, and names the edit that does', () => {
      const assumed = ASSUMED_RUNGS[0]!;
      const why = timedOutBecause({
        what: 'typecheck:fe', timeout: assumed, seconds: 10, measuredOn: HERE, machine: SMALLER,
      });
      expect(why).toContain('so this run is the evidence it waits for');
      expect(why, 'the edit, so the terms and the invariant say the same thing')
        .toContain(`put the number on ${assumed}'s \`stretches\` and move its \`until\` to \`measured\``);
      expect(why, '`until` names the run this reader has just made, so quoting it says "do what you just did"')
        .not.toContain(TIMEOUT_MS[assumed].until);
    });

    it('asks a measured rung\'s reader to record nothing, having nothing outstanding', () => {
      const why = timedOutBecause({
        what: 'test:integration', timeout: 'suite', seconds: 60, measuredOn: HERE, machine: SMALLER,
      });
      expect(why).not.toContain('this run is the evidence');
      expect(why, 'the finding, and no edit to make').toContain('That number is the finding.');
    });
  });

  /**
   * Which rungs a *direct* run can reach, which is the second path into the ladder and the one a claim about
   * reachability keeps forgetting.
   *
   * `scripts/bounded.ts` takes a class on its command line, and four npm scripts invoke it — so a rung is
   * reachable without `npm run chain` and without any chain step at all. A rung's `until` said the opposite
   * about `scenario` ("reached only through `npm run chain`, which CI does not run") while CI's
   * `external-pack-e2e` job bounds two steps at it through exactly this path.
   *
   * **An inventory, not a gate**, in `subprocess-inventory`'s sense: it fails on a *change* rather than on a
   * hit, because the useful moment is when the set moves and the prose describing it has to be revisited. The
   * two halves either side of that are ordinary gates — every class named here is on the ladder, which
   * `timeoutMsFor` otherwise only refuses at runtime, and the set is not empty, since a regex that matched
   * nothing would pass all three.
   */
  it('reaches a rung from a direct npm run too, and the ladder knows every class those name', () => {
    const bounded = boundedIn((JSON.parse(read('package.json')) as Scripts).scripts);

    expect(population('the scripts that bound a direct run', bounded).length).toBeGreaterThan(0);
    for (const { name, className } of bounded) {
      expect(TIMEOUT_CLASSES, `${name} bounds at ${className}, which is no rung on the ladder`)
        .toContain(className);
    }
    expect([...new Set(bounded.map(({ className }) => className))].sort(),
      'the rungs a direct run reaches have changed — re-read every `until` that describes how a rung is '
      + 'exercised before updating this').toEqual(['scenario', 'suite']);
  });

  // The mutation, over data rather than the real manifest: a regex that matched nothing would satisfy every
  // assertion above, which is what the emptiness guard alone cannot tell you. Both halves that can fail are
  // exercised here — a class the ladder has not got, and a rung the recorded set does not name
  it('finds a class a script bounds at, which is what the case above rests on', () => {
    expect(boundedIn({ 'x': 'npm run packages:ensure && tsx scripts/bounded.ts quick bash tests/scripts/x.sh' }))
      .toEqual([{ name: 'x', className: 'quick' }]);
    expect(boundedIn({ 'y': 'tsx scripts/bounded.ts nonsense bash y.sh' })[0]!.className)
      .not.toBeOneOf([...TIMEOUT_CLASSES]);
    expect(boundedIn({ 'z': 'npm test' }), 'a script that bounds nothing contributes nothing').toEqual([]);
  });

  /**
   * No rung exists that nothing uses, which is the argument `SIZE_MS` makes against a third bucket — "two
   * buckets, because two is what has consumers". Three survive it only while three kinds are nameable, and
   * this is what says they still are.
   */
  it('uses every rung of the ladder, so none is a value nothing distinguishes', () => {
    const used = new Set(CHAIN_STEPS.map((step) => step.timeout));
    expect([...used].sort(), 'a rung nothing uses is one to delete').toEqual([...TIMEOUT_CLASSES].sort());
  });

  /**
   * What licenses `PACKAGES_PREBUILT_ENV`, which the chain sets on every step but `packages:ensure`.
   *
   * Under that flag a package found stale is reported rather than rebuilt, and that is only the right answer
   * when the step cannot be the one with building left to do — which is a property of this graph, not of the
   * step table: nothing declares an edge to `packages:ensure`, the edges come from its outputs meeting another
   * step's inputs, and the ordering is transitive (`test:unit:host` reaches it through `compile`). So a new
   * step that reads none of the built packages would be unordered against it, run beside it, and refuse on a
   * package the other step is still building.
   *
   * The flag had no writer between 2026-09-24 and 2026-10-02, so `PackagesWentStale` could not be thrown and a
   * package rewritten under a reader raced a rebuild instead. This is the condition that keeps it honest.
   */
  it('orders every other step after packages:ensure, which is what lets the rest assume it ran', () => {
    const reaches = (name: string, seen = new Set<string>()): boolean =>
      dependsOn(CHAIN_STEPS.find((step) => step.name === name)!).some((need) =>
        need === 'packages:ensure' || (!seen.has(need) && (seen.add(need), reaches(need, seen))));

    const others = CHAIN_STEPS.filter((step) => step.name !== 'packages:ensure');
    expect(others.length, 'no steps besides packages:ensure, so this would pass over nothing').toBeGreaterThan(1);
    expect(others.filter((step) => !reaches(step.name)).map((step) => step.name),
      'these steps can run beside packages:ensure, so telling them the packages are already built is a claim '
      + 'the graph does not support — they would refuse on a package it is still building').toEqual([]);
  });
});
