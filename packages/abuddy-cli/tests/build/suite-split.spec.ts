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
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, halfOfPath, misplaced, readSpecCost, specFiles, stale, unrecorded,
} from '../../../../scripts/lib/spec-cost.ts';

const PACKAGE_DIR = path.join(REPO_ROOT, 'packages', 'abuddy-cli');
const record = readSpecCost(REPO_ROOT);
const files = specFiles(PACKAGE_DIR);

describe('a spec runs in the half its cost puts it in', () => {
  it('has a recorded cost', () => {
    expect(record, `no spec-cost record; run: npm run spec-cost:update -w @abuddy/cli`).toBeDefined();
  });

  it('records every spec, so a new one cannot be filed by accident', () => {
    expect(unrecorded(record!.costs, files), 'run: npm run spec-cost:update -w @abuddy/cli').toEqual([]);
  });

  it('records no spec that has gone', () => {
    expect(stale(record!.costs, files), 'run: npm run spec-cost:update -w @abuddy/cli').toEqual([]);
  });

  it(`moves a fast spec above ${INTEGRATION_ABOVE_MS}ms, and brings an integration one back below ${FAST_BELOW_MS}ms`, () => {
    const wrong = misplaced(record!.costs, files)
      .map(({ file, ms, belongs }) => `${file} costs ${(ms / 1000).toFixed(1)}s, which is ${belongs}, but it is in the ${halfOfPath(file)} half`);
    expect(wrong, 'rename these, or re-measure if the cost has genuinely changed').toEqual([]);
  });

  // The number the threshold is for. If the fast half stops being a few seconds it has stopped being a
  // per-change loop, whatever the individual placements say.
  it('leaves the fast half worth running in a loop', () => {
    const fast = files.filter((file) => halfOfPath(file) === 'fast');
    const total = fast.reduce((sum, file) => sum + record!.costs[file], 0);
    expect(total, `the fast half is ${(total / 1000).toFixed(1)}s of file time across ${fast.length} specs`).toBeLessThan(30_000);
  });
});
