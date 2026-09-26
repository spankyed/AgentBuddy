// Which half a spec runs in is decided by what it costs, recorded in `etc/spec-cost.json`.
//
// It used to be decided by whether the spec's imports reached `node:child_process`. That was a good proxy
// for "slow" only while spawning was the only way to be slow, and three counter-examples ended it: a helper
// that reaches esbuild — which spawns — while reading as clean; a 48s spec with no spawn sites at all,
// filed correctly only because line 1 still imported `execFileSync`; and a 20ms spec filed as spawning
// because the export it imports defaults to `spawnSync`. Mechanism said all three wrongly.
//
// This reads the record and runs nothing. Re-measuring here would make the cheap half expensive, which is
// the thing the split exists to prevent, so `npm run spec-cost:update -w @abuddy/cli` is the deliberate act
// and this is the guard that it was done.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import {
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, halfOfPath, hasSplit, misplaced, outgrown, readSpecCost, specFiles,
  stale, unrecorded,
} from '../../../scripts/lib/spec-cost.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/** Every suite's record, read once. A suite with no record is a failure below, not an empty pass. */
const suites = UNIT_SUITES.map((suite) => {
  const dir = path.join(REPO_ROOT, 'packages', suite.dir);
  return { suite, dir, record: readSpecCost(REPO_ROOT, suite.dir), files: specFiles(dir), split: hasSplit(dir) };
});

describe('every suite records what its specs cost', () => {
  it.each(suites.map(({ suite }) => suite.dir))('%s has a record', (dir) => {
    const found = suites.find((candidate) => candidate.suite.dir === dir)!;
    expect(found.record, `no record for ${dir}; run: npm run spec-cost:update`).toBeDefined();
  });

  it('records every spec, so a new one cannot be placed by accident', () => {
    const missing = suites.flatMap(({ suite, record, files }) => (record ? unrecorded(record, files).map((f) => `${suite.dir}/${f}`) : []));
    expect(missing, 'run: npm run spec-cost:update').toEqual([]);
  });

  it('records no spec that has gone', () => {
    const gone = suites.flatMap(({ suite, record, files }) => (record ? stale(record, files).map((f) => `${suite.dir}/${f}`) : []));
    expect(gone, 'run: npm run spec-cost:update').toEqual([]);
  });
});

describe('a spec runs in the half its cost puts it in', () => {
  it(`moves a fast spec above ${INTEGRATION_ABOVE_MS}ms, and brings an integration one back below ${FAST_BELOW_MS}ms`, () => {
    const wrong = suites
      .filter(({ split, record }) => split && record)
      .flatMap(({ suite, record, files }) => misplaced(record!.costs, files)
        .map(({ file, ms, belongs }) => `${suite.dir}/${file} costs ${(ms / 1000).toFixed(1)}s, which is ${belongs}, but it is in the ${halfOfPath(file)} half`));
    expect(wrong, 'rename these, or re-measure if the cost has genuinely changed').toEqual([]);
  });

  // The number the threshold is for. If the fast half stops being a few seconds it has stopped being a
  // per-change loop, whatever the individual placements say.
  it('leaves the fast half worth running in a loop', () => {
    const cli = suites.find(({ suite }) => suite.dir === 'abuddy-cli')!;
    const fast = cli.files.filter((file) => halfOfPath(file) === 'fast');
    const total = fast.reduce((sum, file) => sum + (cli.record?.costs[file] ?? 0), 0);
    expect(total, `the fast half is ${(total / 1000).toFixed(1)}s of file time across ${fast.length} specs`).toBeLessThan(30_000);
  });
});

/**
 * Specs that cost more than a fast half allows, in a package with one suite. Each entry records what makes
 * that spec expensive, so the cost is known rather than discovered.
 *
 * **This is not a queue of packages to split**, which is what an earlier version of it implied. A split
 * buys a different *tier* — a different timeout budget and a different worker cap — and that is the
 * criterion, not slowness. `@abuddy/cli` has two halves because its expensive specs spawn compilers, so
 * they need a 50% worker cap and tier 2's 60s; the fast half needs neither.
 *
 * Measured 2026-09-25, none of the entries below qualifies. They build TypeScript programs in-process or
 * wait on real timing — no spawn, so no worker cap — and their slowest single tests are around a second
 * against tier 1's 15s. Splitting their packages would buy a faster whole-suite run, which is not the dev
 * loop: `npm run spec -- <file>` is file-targeted, and the chain pools projects and runs only the stale
 * ones. So all three packages stay as they are, on the measurement.
 *
 * What the list is for is the other direction. The check fails on a spec that has become expensive and is
 * not listed, **and** on a listed one that has become cheap, so neither the cost nor the reason can quietly
 * stop being true.
 */
const EXPENSIVE_BY_NATURE: Record<string, string> = {
  // Two TypeScript programs, built through `createModuleExports` and shared by 13 tests. The cost is the
  // compiler, not the assertions; it would drop if the reader could answer from one program.
  'abuddy-sdk/tests/build/declared-type-of.spec.ts': 'builds two TypeScript programs to read declared types',
  // 94 tests: 91 call `generatePackFiles` with a different manifest each (~7.2s, different work every time
  // and so not cacheable), and 3 build TypeScript programs (2.5s since they share a compiler host).
  // Measured in goal-one-job-pool.md Phase 5, which also records why the split it proposed was not done.
  'abuddy-sdk/tests/build/generate-entries.spec.ts': 'runs codegen 91 times and the compiler 3 times',
  // Holds the repo's slowest single test at 4.1s. It spawns real processes and waits on real lock
  // timeouts, so its cost is elapsed time rather than work, and no amount of cores shortens it.
  'abuddy-host/tests/database/write-lock.spec.ts': 'waits on real cross-process lock timeouts',
  // Starts and stops real pack backends and then waits to prove a cron schedule does *not* tick into the
  // next test. The wait is the assertion, so shortening it removes what the test checks.
  'default-setup/tests/harness-app-stop.spec.ts': 'waits to prove a stopped schedule does not tick',
  // Builds a TypeScript program over the pack to check a diagnostic names the event a send is for.
  'default-setup/tests/send-to-system-diagnostics.spec.ts': 'builds a TypeScript program over the pack',
};

describe('a spec that costs more than a fast half allows', () => {
  const found = () => suites
    .filter(({ split, record }) => !split && record)
    .flatMap(({ suite, record, files }) => outgrown(record!.costs, files)
      .map(({ file, ms }) => ({ key: `${suite.dir}/${file}`, ms })));

  it('is recorded, with what makes it expensive', () => {
    const unlisted = found()
      .filter(({ key }) => !(key in EXPENSIVE_BY_NATURE))
      .map(({ key, ms }) => `${key} costs ${(ms / 1000).toFixed(1)}s, over the ${INTEGRATION_ABOVE_MS / 1000}s a fast half allows`);
    expect(unlisted, 'make it cheaper, or record it in EXPENSIVE_BY_NATURE with what makes it expensive').toEqual([]);
  });

  // The other direction: an entry that has become cheap is one the list should stop carrying
  it('records nothing that has since become cheap', () => {
    const live = new Set(found().map(({ key }) => key));
    expect(Object.keys(EXPENSIVE_BY_NATURE).filter((key) => !live.has(key)),
      'these are no longer expensive; drop them from EXPENSIVE_BY_NATURE').toEqual([]);
  });
});
