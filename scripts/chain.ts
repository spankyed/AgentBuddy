// The pre-merge chain: every check, in order, with per-step timings.
//
//   npm run chain
//
// It exists for the timings and the failure output, not for speed. Each step's output is buffered and
// printed only if it fails, so a failure is not buried under six passing suites, and the summary says
// where the time went — which otherwise has to be reconstructed from log file mtimes.
//
// WHY THE STEPS ARE NOT RUN IN PARALLEL
//
// They look parallelisable: after `packages:ensure` and `build`, nothing writes what another step reads,
// each app launch takes its own port (`getPort` in main's `ApiServer`) and its own data dir (`mkdtemp` in
// `@abuddy/testing`), and `ensurePackagesBuilt` returns before taking the build lock when nothing is
// stale. All of that is true. It still does not pay, measured on this machine (2026-09-24, M-series):
//
//   serial, 7 steps                             wall 348s   work 348s   passed
//   3 lanes, test:packaged-authoring in a lane  wall 168s   work 268s   FAILED
//   3 lanes, test:packaged-authoring alone      wall 258s   work 567s   FAILED
//
// The first failure is shared state the step names do not admit to: `test:packaged-authoring` runs
// `npm run packages:build` as its own first step (`tests/scripts/test-packaged-authoring.sh`), so it
// deletes and rewrites the `dist/` every other step reads. `ABUDDY_PACKAGES_PREBUILT=1` now reports that
// rather than racing it.
//
// The second is the machine. Every step already uses all the cores — vitest runs its files across workers,
// tsc forks per project — so lanes oversubscribe rather than overlap: total work went from 348s to 567s,
// `@abuddy/cli` went from 56s to 118s, and it began reporting errors it does not report alone. Wall time
// fell, but only by doing 60% more work, and failing.
//
// So the constraint is cores, not ordering, and the way to a shorter chain is a cheaper `test:unit` —
// `@abuddy/cli` is over half of it — not a rearranged one. Reopen this on a machine with idle cores, and
// measure rather than trust the arithmetic: max() assumes steps do not slow each other, and here they do.
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, fingerprintInputs } from '@abuddy/host/build/packages-built';

/**
 * Bump when a step is added or removed, or when what the fingerprint covers changes: an older stamp would
 * then say a chain passed on inputs this one does not check, and every tree runs once, which is correct.
 */
const STAMP_VERSION = 1;
const STAMP = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-chain', 'tree.json');

/**
 * What the chain's verdict depends on: the tracked files under packages/, scripts/ and tests/, plus the
 * root manifests. Tracked, because the chain writes into `dist/`, `src/__generated__/` and
 * `tests/screenshots/` itself, and hashing its own output would mean no two runs ever agree.
 *
 * This is deliberately all-or-nothing rather than a set of inputs per step. Per-step caching was measured
 * and does not fit: `test:external-pack` and `test:packaged-authoring` both run `abuddy test` against this
 * checkout's built app (`--app-root`), so they depend on the renderer, main, preload, api and
 * default-setup, and `tests/fixtures/external-pack` declares a dependency on default-setup as well. Every
 * expensive step transitively reads nearly the whole repo, so the only sound skip is "nothing changed".
 * That is not a small case: of the 20 commits before this was written, three touched no input at all.
 */
function treeFingerprint(): string {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\0').filter(Boolean)
    .filter((f) => f.startsWith('packages/') || f.startsWith('scripts/') || f.startsWith('tests/')
      || f === 'package.json' || f === 'package-lock.json');
  return fingerprintInputs(tracked.map((f) => path.join(REPO_ROOT, f)));
}

function lastPassing(): string | undefined {
  try {
    const stamp = JSON.parse(fs.readFileSync(STAMP, 'utf-8')) as { version: number; fingerprint: string };
    return stamp.version === STAMP_VERSION ? stamp.fingerprint : undefined;
  } catch { return undefined; }
}

function recordPassing(fingerprint: string): void {
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, `${JSON.stringify({ version: STAMP_VERSION, fingerprint, passedAt: new Date().toISOString() }, null, 2)}\n`);
}

/**
 * In dependency order. `compile` stays ahead of `build` and is not redundant with it: `build -ws` gives no
 * ordering guarantee, since no workspace declares a dependency on `@app/default-setup`, and the renderer's
 * build reads the generated pack entry that `compile` writes.
 */
const STEPS = [
  'packages:ensure',
  'compile',
  'typecheck',
  'test:unit',
  'build',
  'test:external-pack',
  'test', // the E2E suite
  'test:packaged-authoring',
];

type Result = { step: string; ms: number; code: number; output: string };

function run(step: string): Promise<Result> {
  const started = Date.now();
  // `npm test` is the E2E suite and takes no `run`
  const args = step === 'test' ? ['test'] : ['run', step];
  return new Promise((resolve) => {
    const child = spawn('npm', args, { cwd: process.cwd(), env: process.env });
    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    child.on('close', (code) => resolve({ step, ms: Date.now() - started, code: code ?? 1, output }));
  });
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main(): Promise<void> {
  const started = Date.now();
  const results: Result[] = [];
  const all = process.argv.includes('--all');
  const fingerprint = treeFingerprint();

  if (!all && fingerprint === lastPassing()) {
    console.log('nothing tracked under packages/, scripts/ or tests/ has changed since the chain last');
    console.log('passed on exactly this tree, so there is nothing for it to prove. `--all` runs it anyway.');
    return;
  }

  for (const step of STEPS) {
    const result = await run(step);
    results.push(result);
    console.log(`${result.code === 0 ? '  ok ' : ' FAIL'} ${step.padEnd(24)} ${secs(result.ms)}`);
    if (result.code !== 0) {
      console.log(`\n${'='.repeat(72)}\n${step} failed (exit ${result.code})\n${'='.repeat(72)}\n${result.output}`);
      break;
    }
  }

  const failed = results.find((r) => r.code !== 0);
  // Recorded after the run, and only on a pass: the fingerprint is of the tracked inputs, which the run
  // does not touch, so it still describes the tree the verdict was reached on.
  if (!failed) recordPassing(fingerprint);
  console.log(`\n${failed ? `chain FAILED at ${failed.step}` : 'chain passed'} — ${secs(Date.now() - started)}`);
  process.exit(failed ? 1 : 0);
}

await main();
