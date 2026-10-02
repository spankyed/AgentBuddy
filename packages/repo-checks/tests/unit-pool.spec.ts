// Reading a vitest run's own output to find out what it actually covered.
//
// The pool asks for N projects with `--project` and then stamps all N. That is only sound if the filter
// selected them: measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears, drops the
// second silently and exits 0. Only a filter matching *nothing at all* is an error. So a suite whose
// workspace stopped matching its vitest project name would be stamped as having passed a run it was
// excluded from — the same "recorded fresh having never run" the pool was already fixed for once.
import { describe, expect, it } from 'vitest';
import { declaredPaths, diffableStamp } from '@abuddy/host/build/packages-built';
import { POOLS, livePoolStamps, poolStampFor, poolUnitFor, projectsThatRan, projectsThatDidNotRun, whyItRuns, type Pool } from '../../../scripts/lib/unit-pool.ts';
import { POOL_SECONDS } from '../../../scripts/lib/chain-steps.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

// vitest's `formatProjectName`: `|name|` only when colour is unsupported, otherwise the name padded with a
// space on each side, black on one of four background colours. Both of these are that function's output, the
// coloured one copied byte for byte from a real run — which is the thing this file previously guessed at, and
// the guess is why the pool failed every run with colour on while reporting that no project had run
const line = (project: string, file: string) => ` ✓ |${project}| ${file} (3 tests) 12ms`;
const colouredLine = (project: string, file: string) =>
  ` \u001B[32m✓\u001B[39m \u001B[30m\u001B[46m ${project} \u001B[49m\u001B[39m ${file} \u001B[2m(\u001B[22m\u001B[2m4 tests\u001B[22m\u001B[2m)\u001B[22m\u001B[32m 2\u001B[2mms\u001B[22m\u001B[39m`;

describe('projectsThatRan', () => {
  it('reads the project label vitest puts on every file of a multi-project run', () => {
    const output = [line('@abuddy/ears', 'tests/a.spec.ts'), line('@app/main', 'tests/b.spec.ts'), line('@abuddy/ears', 'tests/c.spec.ts')].join('\n');
    expect([...projectsThatRan(output)].sort()).toEqual(['@abuddy/ears', '@app/main']);
  });

  it('reads the coloured label, which is the only one a terminal or a FORCE_COLOR pipe ever prints', () => {
    const output = [colouredLine('@abuddy/ears', 'tests/a.spec.ts'), colouredLine('@app/main', 'tests/b.spec.ts')].join('\n');
    expect([...projectsThatRan(output)].sort()).toEqual(['@abuddy/ears', '@app/main']);
  });

  it('sees through the colours around a piped label, which a partly-coloured run still has', () => {
    expect([...projectsThatRan(' \u001B[32m✓\u001B[39m |@abuddy/sdk| tests/a.spec.ts (1 test) 2ms')]).toEqual(['@abuddy/sdk']);
  });

  it('counts a failed or skipped file, which still proves the project ran', () => {
    expect([...projectsThatRan([' × |@app/api| tests/a.spec.ts', ' ↓ |@app/api| tests/b.spec.ts'].join('\n'))]).toEqual(['@app/api']);
  });

  it('finds nothing in a run that printed no labels', () => {
    expect([...projectsThatRan(' ✓ tests/a.spec.ts (3 tests) 12ms\n Test Files  1 passed (1)')]).toEqual([]);
  });
});

describe('projectsThatDidNotRun', () => {
  const asked = ['@abuddy/ears', '@app/main'];

  it('names a project that was asked for and never reported', () => {
    expect(projectsThatDidNotRun(asked, line('@abuddy/ears', 'tests/a.spec.ts'))).toEqual(['@app/main']);
  });

  it('says nothing when every project reported', () => {
    expect(projectsThatDidNotRun(asked, [line('@abuddy/ears', 'a'), line('@app/main', 'b')].join('\n'))).toEqual([]);
  });

  // A single-project run prints no labels at all, so absence proves nothing there — the process exiting 0
  // is the evidence, and the pack pool runs exactly one project per invocation
  it('says nothing about a single-project run, which prints no labels', () => {
    expect(projectsThatDidNotRun(['@app/default-setup'], ' ✓ tests/a.spec.ts (3 tests) 12ms')).toEqual([]);
  });

  it('names them all when the filter matched none of several', () => {
    expect(projectsThatDidNotRun(asked, ' Test Files  0 passed (0)')).toEqual(asked);
  });

  // The failure this guard had: eleven projects ran, every one of them printed a coloured label, and the pool
  // refused the run. Colour is the normal case, not the exotic one
  it('says nothing when every project reported under colour', () => {
    const output = [colouredLine('@abuddy/ears', 'tests/a.spec.ts'), colouredLine('@app/main', 'tests/b.spec.ts')].join('\n');
    expect(projectsThatDidNotRun(asked, output)).toEqual([]);
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
