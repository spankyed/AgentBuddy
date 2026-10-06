// Reading a run's own reporter to find out what it actually covered.
//
// The pool asks for N projects with `--project` and then stamps all N. That is only sound if the filter
// selected them: measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears, drops the
// second silently and exits 0. Only a filter matching *nothing at all* is an error. So a suite whose
// workspace stopped matching its vitest project name would be stamped as having passed a run it was
// excluded from — the same "recorded fresh having never run" the pool was already fixed for once.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { declaredPaths, diffableStamp } from '@abuddy/host/build/packages-built';
import { DIAGNOSTIC_RUN_ENV, POOLS, livePoolStamps, poolStampFor, poolUnitFor, projectsThatDidNotRun, recordRun, recordsVerdict, whyItRuns, type Pool } from '../../../scripts/lib/unit-pool.ts';
import type { ReportedRun } from '../../../scripts/lib/spec-durations-reporter.ts';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, POOL_SECONDS, poolStepName } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/** A run as its reporter recorded it, which is the only account the pool reads now */
/**
 * Every way this repo runs a unit suite carries the durations reporter.
 *
 * **This is the check the defect it covers went without.** `scripts/test-unit.ts` ran the suites through
 * its own copy of what a pool is and spawned vitest directly, so `npm run test:unit` — the command a person
 * runs by hand — carried no reporter, checked no `@slow:` marker and wrote no duration. Nothing failed,
 * because nothing asked. The durations are now a thing a run has to opt into, which makes "did every
 * launcher opt in" the question worth gating, and both halves of it are derived rather than listed.
 */
describe('a unit suite is never run without the durations reporter', () => {
  const REPORTER = 'spec-durations-reporter.ts';

  it('is passed by every pool, for every run it builds', () => {
    const pools = Object.keys(POOLS) as Pool[];
    expect(pools.length, 'no pools derived, so this passes over nothing').toBeGreaterThan(2);
    for (const pool of pools) {
      const runs = POOLS[pool].run(POOLS[pool].suites());
      expect(runs.length, `${pool} builds no run`).toBeGreaterThan(0);
      for (const { args } of runs) {
        expect(args.some((arg) => arg.includes(REPORTER)), `${pool}: ${args.join(' ')}`).toBe(true);
        // Naming any reporter replaces the human output, so the default has to be asked for back
        expect(args, `${pool} would lose vitest's own output`).toContain('--reporter=default');
      }
    }
  });

  /**
   * And no other script launches one, which is the half that would have caught the defect.
   *
   * A pool's own args are easy to keep right; what went wrong was a *second launcher*. So this asks the
   * tree instead: any script naming `vitest` as the thing it runs has to be one of the pools or carry a
   * reason. The reasons are specific — `spec-plan.ts` builds the `npm run spec` runs, which are a
   * different question (which specs cover a change) and carry their own counting reporter.
   */
  const LAUNCHES_VITEST_BY_DESIGN: Record<string, string> = {
    'lib/spec-plan.ts': 'the runs `npm run spec` builds — a different question from a pool, and they carry '
      + "spec-count-reporter.ts, whose count is what tells a covered run from one that did nothing",
    'lib/unit-pool.ts': 'the pools themselves, whose args the case above checks',
  };

  const launchers = (): string[] => {
    const root = path.join(REPO_ROOT, 'scripts');
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
    // `'vitest'` as an argument, which is how a spawn names the binary — not the word in a comment or a
    // path like `vitest.config.ts`, which every chain step declares
    return walk(root)
      .filter((file) => /['"`]vitest['"`]\s*,/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(root, file))
      .sort();
  };

  it('finds the launchers, so this is not vacuous', () => {
    expect(launchers().length, 'no script names vitest as a spawn, so the rule below sees nothing')
      .toBeGreaterThan(0);
  });

  it('leaves no script launching one outside the pools', () => {
    const stray = launchers().filter((file) => !(file in LAUNCHES_VITEST_BY_DESIGN));
    expect(stray, 'run the suites through scripts/test-unit-pool.ts, or add a reason here: a launcher of '
      + 'its own gets no durations reporter, so it checks no @slow: marker and records nothing').toEqual([]);
  });

  // A list of exceptions is honest only while each entry is still one
  it('lists no exception that has stopped launching one', () => {
    const live = new Set(launchers());
    expect(Object.keys(LAUNCHES_VITEST_BY_DESIGN).filter((file) => !live.has(file)),
      'drop these from LAUNCHES_VITEST_BY_DESIGN').toEqual([]);
  });
});

/**
 * Each pool's chain step, which is two declarations held to each other rather than one generator.
 *
 * `poolStepName` cannot *be* the table's name: `declaredAt` finds a generated step by matching the
 * template literal it came from, so a call there left all three pool steps unlocatable and a run unable to
 * point at their reasoning. So the table writes the names and this checks the reverse lookup lands on a
 * real step — which is the firing case for a rename of either one alone.
 */
describe('poolStepName', () => {
  it('names a step the table really has, for every pool', () => {
    const names = new Set(CHAIN_STEPS.map((step) => step.name));
    for (const pool of Object.keys(POOLS) as Pool[]) {
      expect(names, `${pool} pool's step`).toContain(poolStepName(pool));
    }
  });

  it('gives each pool its own step, so no two report from one', () => {
    const named = (Object.keys(POOLS) as Pool[]).map(poolStepName);
    expect(new Set(named).size, named.join(', ')).toBe(named.length);
  });
});

const ran = (...projects: string[]): ReportedRun => ({ projects, modules: [] });

/**
 * What a run covered, and what it did not.
 *
 * **This used to read vitest's console labels, and the cases that went with it are worth knowing about.**
 * `formatProjectName` writes `|name|` when colour is unsupported and a space-padded coloured name when it
 * is, so there were two spellings to handle, one of them copied byte for byte from a real run after a
 * version that guessed at it failed every coloured run while reporting that no project had run. Two cases
 * also encoded limits that were the *parse's* and not the question's: a single-project run prints no label
 * at all, so absence proved nothing there, and a project that ran zero files appeared in no output.
 *
 * The reporter names every project the run started, so none of that survives: there is no spelling, no
 * minimum project count, and no case this cannot answer.
 */
describe('projectsThatDidNotRun', () => {
  const asked = ['@abuddy/ears', '@app/main'];

  it('names a project that was asked for and never reported', () => {
    expect(projectsThatDidNotRun(asked, ran('@abuddy/ears'))).toEqual(['@app/main']);
  });

  it('says nothing when every project reported', () => {
    expect(projectsThatDidNotRun(asked, ran('@abuddy/ears', '@app/main'))).toEqual([]);
  });

  it('names them all when the filter matched none of several', () => {
    expect(projectsThatDidNotRun(asked, ran())).toEqual(asked);
  });

  /**
   * And it answers for a single-project run, which the parse could not.
   *
   * The pack pool runs exactly one project per invocation, so this was the common case and the one with
   * no coverage: vitest prints no label for it, and the old check returned `[]` for any run of fewer than
   * two projects. A pack suite whose workspace name had drifted would have been stamped on a run it was
   * excluded from, and nothing could have said so.
   */
  it('answers for a one-project run, where a label was never printed', () => {
    expect(projectsThatDidNotRun(['@app/default-setup'], ran())).toEqual(['@app/default-setup']);
    expect(projectsThatDidNotRun(['@app/default-setup'], ran('@app/default-setup'))).toEqual([]);
  });

  // A project the run started and found no file for is still a project that ran, and it is nameable from
  // nowhere else: it appears in no reporter's output, only in the specifications the run began with
  it('counts a project that reported no files, which no output could have shown', () => {
    expect(projectsThatDidNotRun(['@abuddy/ui'], { projects: ['@abuddy/ui'], modules: [] })).toEqual([]);
  });
});

/**
 * A pool runs a subset, so every non-empty run claims something about which projects moved — and `--dry` cannot
 * settle it, because it reports on the step, a different unit with a different input set.
 */
describe('whyItRuns', () => {
  // Through the reader the caller uses, so these cases cannot drift from what it accepts: the signature takes a
  // read rather than a record precisely so a caller cannot reach the digests without having been told they are
  // readable, and a fixture built by hand would be free of that
  const read = (record: Parameters<typeof diffableStamp>[0]) => diffableStamp(record);
  const stamped = { fingerprint: 'abc', declared: ['packages/x/src'], files: { 'packages/x/src/a.ts': 'd' } };

  it('names what moved, which is the whole of what the line adds', () => {
    expect(whyItRuns(read(stamped), () => 'changed packages/x/src/a.ts (and 2 more)'))
      .toBe('changed packages/x/src/a.ts (and 2 more)');
  });

  /**
   * Live in this store, not hypothetical: `abuddy-unit-pool/abuddy-ears.json` is a 175-byte stamp from before
   * the digests were recorded, and `node_modules/.cache` is never cleared, so it is what a machine has today.
   */
  it('says so when the stamp predates the digests, rather than guessing', () => {
    expect(whyItRuns(read({ fingerprint: 'abc' }), () => 'changed a.ts'))
      .toBe('its last run recorded no per-file digests');
  });

  it('distinguishes a project that has never run from one whose inputs moved', () => {
    expect(whyItRuns(read(undefined), () => 'changed a.ts')).toBe('has not run yet');
    expect(whyItRuns(read({}), () => 'changed a.ts')).toBe('has not run yet');
  });

  /** The diff can come back empty on a walk-time race; the line still has to say something true */
  it('falls back to the verdict when the diff names nothing', () => {
    expect(whyItRuns(read(stamped), () => '')).toBe('its inputs changed');
  });

  /**
   * The defect as a property rather than a string: a stamp this reader will not hand over must not be diffed at
   * all. It was — the digests were read and a file named, beside a reason saying the stamp could not be read —
   * so the thing to hold is that the diff is never reached, not merely that the words came out right.
   *
   * The subject used to be a version the reader did not recognise. It is now a digest map holding something
   * that is not a digest, which is the same state for this line's purpose and one the bytes on disk declare for
   * themselves rather than one a human had to remember to announce.
   */
  it('never computes the diff for a stamp it may not compare', () => {
    let asked = false;
    const unreadable = read({ ...stamped, files: { 'packages/x/src/a.ts': 7 } });
    expect(whyItRuns(unreadable, () => { asked = true; return 'changed packages/x/src/a.ts'; }))
      .toBe('its record of what it read is in a shape this cannot read');
    expect(asked, 'it diffed digests whose shape says nothing about the tree').toBe(false);
  });
});


// What a pool is, and what two of them may not share.
//
// A suite with an expensive half runs twice over one input set, and the two runs are not interchangeable: its
// fast half can have passed while the integration half never has. So the stamp is keyed by the half as well as
// the directory, and the invariant that makes the integration pool safe to cache at all is that no two
// (suite, half) pairs any pool asks for land on one file. One key for both would let the second be skipped on
// the first's record — the hole that kept the expensive half from being pooled until now.
//
// The subject is derived from `POOLS` rather than listed, so a fourth pool is covered on arrival.
describe('the pools', () => {
  const names = Object.keys(POOLS) as Pool[];
  const entries = names.flatMap((name) => POOLS[name].suites().map((suite) => ({ name, suite, half: POOLS[name].half })));

  it('there are some, and none of them is empty', () => {
    expect(names).not.toEqual([]);
    for (const name of names) expect(POOLS[name].suites(), `the ${name} pool covers no suite`).not.toEqual([]);
  });

  it('give no two of their projects the same stamp', () => {
    const keys = entries.map(({ suite, half }) => poolStampFor(suite, half));
    const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(duplicated, 'two pools would write one stamp, so running either would mark the other fresh')
      .toEqual([]);
  });

  /**
   * And the content twin of that case, which is the one that can give a wrong answer.
   *
   * A distinct path is where a record is kept; what says *which* record it is has to be in the preimage,
   * because `unitStaleReason` recomputes its own side and consults nothing else on the stamp. Until the
   * command joined `poolUnitFor`, the three two-half suites hashed identical preimages, and a stamp read
   * under the wrong key would have come out **fresh** — the expensive half skipped on the fast half's
   * record, which is the hole this pool was fixed for once already.
   *
   * On the preimage rather than the digest of it: `fingerprintUnit` would walk every input of fifteen units,
   * seconds of hashing for a question about identity, and the bytes are the one part that is the same for
   * both halves by definition. These two are what the hash is a function of beside them.
   */
  it('give no two of their projects the same preimage', () => {
    const identity = entries.map(({ name, suite }) => {
      const unit = poolUnitFor(suite, name);
      return JSON.stringify([declaredPaths(unit), unit.command]);
    });
    const duplicated = identity.filter((key, index) => identity.indexOf(key) !== index);
    expect(duplicated, 'two units hash the same preimage, so either one\'s stamp reads as fresh for the other')
      .toEqual([]);
  });

  /**
   * What makes them differ, named — so the case above cannot pass on an accident of the declared set.
   *
   * The command is taken from the pool's own `run`, which is why it is specific enough to be worth hashing:
   * the integration pool names the config it passes, and the host pool the wrapper that supplies the
   * `@abuddy/source` condition. Two pools running one suite two ways is the whole subject.
   */
  it('record what each pool would run, as its command', () => {
    const [both] = entries.filter(({ suite }) => entries.filter((other) => other.suite.dir === suite.dir).length > 1);
    expect(both, 'no suite is in two pools, so this case has nothing to be about').toBeDefined();
    const commands = (Object.keys(POOLS) as Pool[])
      .filter((name) => POOLS[name].suites().some((suite) => suite.dir === both!.suite.dir))
      .map((name) => poolUnitFor(both!.suite, name).command ?? '');
    expect(commands.filter((command) => command.includes('vitest.integration.config.ts')).length,
      'no command names the config that makes it the expensive half').toBe(1);
    expect(new Set(commands).size, 'two pools run this suite and their commands do not differ').toBe(commands.length);
  });

  it('reach every unit suite, each in exactly one of the fast pools', () => {
    const fast = entries.filter(({ half }) => half === 'fast').map(({ suite }) => suite.dir);
    expect(fast.sort()).toEqual(UNIT_SUITES.map((suite) => suite.dir).sort());
  });

  // What prune keeps. The dead file it has to recognise is the shape the key used to have, before the half
  // joined it — a stamp named for the directory alone, which one pool would read as the other's record.
  it('count their own stamps live and nothing else', () => {
    const live = livePoolStamps();
    expect(live.size).toBe(entries.length);
    expect([...live].filter((file) => !/\.(fast|integration)\.json$/.test(file)),
      'a stamp keyed by the directory alone is the pre-half shape, which prune must drop').toEqual([]);
  });

  // `POOL_SECONDS` cannot be keyed off `Pool`: `unit-pool.ts` imports the steps, so the steps cannot import
  // the pools back. A check stands in for the derivation, because a pool with no budget gets `budgetFor` of
  // nothing — a timeout of NaN, which bounds no run at all.
  it('each have a measured budget', () => {
    expect(Object.keys(POOL_SECONDS).sort()).toEqual([...names].sort());
  });
});

/**
 * What a run is allowed to record, which is the half of the chain's retry policy that was missing.
 *
 * The chain refuses to stamp a step it re-ran alone, so the next chain does the step again — stated in
 * `chain.ts` and in `classifyLine`'s doc, and true only of the chain's own stamp. A pool keeps its own, and on
 * 2026-10-02 the stamps showed what that costs: a laned failure of `test:unit:host`, a re-run that passed and
 * wrote all eleven project stamps, and a next chain that ran zero tests and called the step green. These three
 * cases are what that sequence had nothing holding it.
 */
describe('a diagnostic run', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A unit over one real file, since the fingerprint is of bytes on disk */
  function fixture(): { unit: { inputs: string[]; outputs: never[]; command: string }; stamp: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-record-run-'));
    made.push(dir);
    const input = path.join(dir, 'input.ts');
    fs.writeFileSync(input, 'export const x = 1;\n');
    return { unit: { inputs: [input], outputs: [], command: 'a command' }, stamp: path.join(dir, 'stamp.json') };
  }

  it('is what the environment says it is, and an ordinary run is the default', () => {
    expect(recordsVerdict({})).toBe(true);
    expect(recordsVerdict({ [DIAGNOSTIC_RUN_ENV]: '1' })).toBe(false);
  });

  it('does the work and records none of it, where an ordinary run records what it covered', async () => {
    const ordinary = fixture();
    let ran = 0;
    await recordRun([{ label: 'ordinary', unit: ordinary.unit, stamp: ordinary.stamp }], () => { ran += 1; }, {});
    expect(fs.existsSync(ordinary.stamp), 'an ordinary run must still stamp, or nothing is ever cached').toBe(true);

    const diagnostic = fixture();
    await recordRun([{ label: 'diagnostic', unit: diagnostic.unit, stamp: diagnostic.stamp }],
      () => { ran += 1; }, { [DIAGNOSTIC_RUN_ENV]: '1' });
    expect(ran, 'a diagnostic run has to do the work — it is being asked whether the work passes alone').toBe(2);
    expect(fs.existsSync(diagnostic.stamp),
      'a diagnostic run recorded a verdict, so the next chain will skip the step that just failed').toBe(false);
  });

  /**
   * And it leaves alone what it may not write. `stampedRunAll` clears a stamp before the run, so reaching it at
   * all would invalidate a record this run is not permitted to replace — a pass it cannot report.
   */
  it('neither writes nor clears an existing record', async () => {
    const { unit, stamp } = fixture();
    await recordRun([{ label: 'first', unit, stamp }], () => {}, {});
    const recorded = fs.readFileSync(stamp, 'utf-8');

    await recordRun([{ label: 'second', unit, stamp }], () => {}, { [DIAGNOSTIC_RUN_ENV]: '1' });
    expect(fs.readFileSync(stamp, 'utf-8')).toBe(recorded);
  });
});

/**
 * The call site that has to ask for it. Suppression inside the pool is no use if the chain's re-run does not
 * say it is a diagnostic, and that is one argument on one line in another file — exactly the kind of thing a
 * later edit drops. Read from the syntax tree rather than the text, so reformatting the call is not a failure.
 *
 * To watch it fail: delete the `DIAGNOSTIC_RUN_ENV` argument from the retry in `chain.ts`.
 */
describe("the chain's classification re-run", () => {
  it('spawns the step with recording suppressed', () => {
    const file = path.join(REPO_ROOT, 'scripts', 'chain.ts');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);

    // What chain.ts binds from the pool module, read from its own import rather than named here: the case is
    // about the argument being passed, not about what the constant is called.
    const fromPool = new Set<string>();
    const branches: ts.IfStatement[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text.endsWith('unit-pool.ts')) {
        const bindings = node.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) fromPool.add(element.name.text);
        }
      }
      if (ts.isIfStatement(node) && node.expression.getText() === 'classifying') branches.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(branches.length, 'no `if (classifying)` in chain.ts, so this case is asserting over nothing').toBe(1);
    expect([...fromPool], 'chain.ts imports nothing from the pool module, so it cannot ask for suppression')
      .not.toEqual([]);

    // The identifiers the re-run's `run(...)` call is *given*, not the text of the branch: the branch's own
    // comment names the constant, so a text match passed with the argument deleted — watched, on the first
    // mutation check this case was put through.
    const passed = new Set<string>();
    const readArgs = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.expression.getText() === 'run') {
        for (const argument of node.arguments) {
          const names = (child: ts.Node): void => {
            if (ts.isIdentifier(child)) passed.add(child.text);
            ts.forEachChild(child, names);
          };
          names(argument);
        }
      }
      ts.forEachChild(node, readArgs);
    };
    readArgs(branches[0]!);

    expect([...fromPool].some((binding) => passed.has(binding)),
      'the re-run passes the pool nothing, so a step that caches inside itself records a verdict the chain '
      + 'refuses to record, and the next chain skips the step that just failed').toBe(true);
  });
});
