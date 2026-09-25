// Every tracked source file is an input to some chain step, or is named here with a reason. Caching a step
// on its declared inputs is only as sound as that list: a file no step names is a file whose change skips
// every check, silently, and with CI off the chain is the only gate. `BUILD_UNITS` never needed this —
// it covers five packages whose builds read their own trees — where a chain step reads whatever its script
// happens to reach, which is not visible from the step's name.
//
// It asks git rather than walking the tree, so an ignored file is not mistaken for an untracked source, and
// resolves a step's inputs through `inputFiles` — the walk a fingerprint is taken over — so the guard and
// the cache key cannot disagree about what an input covers.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputFiles, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../../scripts/lib/chain-steps.ts';

/** Tracked code no chain step reads, and why. An entry that stops applying is reported, not ignored. */
const NOT_A_CHAIN_INPUT: Record<string, string> = {
  'electron-builder.mjs': 'packaging config, read by npm run build-prod — which is not a chain step',
  'build/prod/diagnostics.mjs': 'runs inside a packaged app, not during any check',
  'build/prod/verify-node-modules.mjs': 'packaging check; the chain has its own in the cli suite',
  'packages/abuddy-ears/bench/ears.bench.ts': 'npm run bench -w @abuddy/ears, measured against its own baseline',
  'docs/archive/research/claude_code_headless_ex.ts': 'an archived transcript that happens to end in .ts',
};

const CODE = /\.(ts|tsx|vue|mts|cts|mjs|cjs|js)$/;

const trackedCode = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter((file) => file !== '' && CODE.test(file));

/** Every tracked file the steps' inputs reach, resolved the way a fingerprint resolves them */
const coveredBy = (steps: readonly { inputs: readonly string[] }[]): Set<string> => {
  const covered = new Set<string>();
  for (const step of steps) for (const input of step.inputs) for (const file of inputFiles(path.join(REPO_ROOT, input))) covered.add(file);
  return covered;
};

describe('the chain reads every source file', () => {
  it('has no tracked code that no step names', () => {
    const covered = coveredBy(CHAIN_STEPS);
    const missing = trackedCode().filter((file) => !covered.has(file) && !(file in NOT_A_CHAIN_INPUT));
    expect(missing, 'add these to a step\'s inputs, or to NOT_A_CHAIN_INPUT with a reason').toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const covered = coveredBy(CHAIN_STEPS);
    const stale = Object.keys(NOT_A_CHAIN_INPUT).filter((file) => {
      if (!fs.existsSync(path.join(REPO_ROOT, file))) return true;
      return covered.has(file);
    });
    expect(stale, 'these are gone or are now a step input; drop them from NOT_A_CHAIN_INPUT').toEqual([]);
  });

  // Coverage is repo-wide: it proves *some* step reads a file, not that the right one does. Steps overlap
  // honestly — `typecheck` reads `tests/` because it compiles the E2E specs — so dropping `tests/e2e` from
  // the E2E step leaves it covered and the check above green. This is the per-step half, and it is what can
  // be derived: a path the step's own npm script names is a path that step reads, so it must be an input.
  it('gives every step the files its own script names', () => {
    const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    const missing: string[] = [];
    for (const step of CHAIN_STEPS) {
      const covered = coveredBy([step]);
      const command = scripts[step.name === 'test' ? 'test' : step.name] ?? '';
      for (const [, named] of command.matchAll(/\b((?:tests|scripts)\/[\w./-]+\.(?:sh|ts|mjs))/g)) {
        if (!covered.has(named)) missing.push(`${step.name} runs ${named} and does not declare it`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every step inputs that exist', () => {
    const empty = CHAIN_STEPS.filter((step) => step.inputs.every((input) => !fs.existsSync(path.join(REPO_ROOT, input))));
    expect(empty.map((step) => step.name), 'a step whose every input is missing is cached on nothing').toEqual([]);
  });
});
