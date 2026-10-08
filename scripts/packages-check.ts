#!/usr/bin/env node
/**
 * `npm run packages:check`: publint and arethetypeswrong over the trees npm publishes.
 *
 * **Nothing here writes where another step reads, and that is the point of the file.** `attw --pack <dir>` runs
 * `npm pack` *inside* the tree it is analysing and deletes the tarball afterwards, so a reader of that tree
 * sees a file appear and vanish: `ENOENT: open 'publish/abuddy-ui-0.1.0.tgz'` is what that costs. Keeping every
 * other step away from those trees instead is a mutex against 29 of the chain's 30 steps, which is 6.0s of a
 * cold run — simulated over the table's declared seconds, and the step's whole cost, since conflicting with
 * everything means running alone. So `packTree` packs each tree into a temp directory outside the repository
 * and `attw` is given the path.
 *
 * **Both populations are derived**, because a shell chain cannot derive one: it would name every tree once per
 * tool, and `attw`'s skipping of `@abuddy/cli` would be implicit in the shape of the command, where a further
 * package shipping no declarations goes silently unchecked. The trees come from `publishedTreeDirs()`, and
 * attw's subset is *a tree whose manifest declares types* — the reason the CLI is skipped rather than the fact.
 *
 * What is asked of which tree is `lib/packages-check-plan.ts`, so it can be asked without running any of it.
 *
 * **Serial, as the shell chain was.** Fanning the five out is a separate change with its own measurement:
 * `api:check` sits on the `suite` rung *because* it fans out, and `chain-graph.spec.ts` holds every step to the
 * rung its work implies — so parallelising a step that is not on the critical path reopens that question for
 * nothing. Nothing here bounds a subprocess either, for the same reason it did not before: the chain's own
 * deadline covers the step, and serial work cannot hide a hang the way concurrent work can.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT, packagesBuiltOrRefuse, publishedTreeDirs } from '@abuddy/host/build/packages-built';
import { packTree } from '@abuddy/host/build/published-manifest';
import { checksFor, type PublishedTree } from './lib/packages-check-plan.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

/**
 * **A gate must not report success about an artifact it did not verify**, which is the whole of why this is
 * here: publint and attw over a tree the sources have moved past say the published packages are fine about
 * output nobody would publish. Door 8 of the freshness doors (`packages/abuddy-testing/CLAUDE.md`, the only
 * record that a door exists — add a row before adding a caller).
 *
 * It refuses rather than rebuilding, as door 7 does: this is a chain step, and a step that writes what it
 * declares as an input leaves every later step stale. Every caller already builds first — the chain orders
 * this after `packages:ensure`, both workflows build in the step before — so what it catches is a run by
 * hand, and it costs a stale tree nothing rather than a subprocess per check below.
 */
packagesBuiltOrRefuse('npm run packages:build');

const trees: PublishedTree[] = Object.entries(publishedTreeDirs()).map(([pkg, dir]) => ({
  pkg, dir, manifest: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as Record<string, unknown>,
}));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-packages-check-'));
const failures: { label: string; output: string }[] = [];

/**
 * The tool's bin, **never `npx`**, which re-resolves the package on every call: over the nine calls here that
 * is **8.1s against 6.2s**, both medians of 5 at ~73% idle on 2026-10-08, or about 210ms a call. An npm script
 * has `node_modules/.bin` on `PATH` and pays none of it, which is why the shell chain this replaced did not —
 * a script run by `tsx` has to say where the bin is. Declared cost is 6s, and this form measures 6.2s.
 *
 * The link rather than the package's own `bin` field, which is how `build-ui-package.ts` resolves tsdown:
 * `publint` does not export `./package.json`, so there is nothing to read the field out of. A bin that is not
 * there fails with `ENOENT` naming this path, which is as clear as a thrown message would be.
 */
const binFor = (tool: string): string => path.join(REPO_ROOT, 'node_modules', '.bin', tool);

try {
  for (const { label, tool, args } of checksFor(trees, (dir) => packTree(dir, tmp))) {
    try {
      process.stdout.write(execFileSync(binFor(tool), [...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString());
      process.stdout.write(`  ok   ${label}\n`);
    } catch (err) {
      const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
      failures.push({ label, output: `${stdout?.toString() ?? ''}${stderr?.toString() ?? ''}` || String(err) });
      process.stdout.write(`  FAIL ${label}\n`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Every failure, not the first: the same reason `npm run typecheck` stopped being an `&&` chain, where one
// package's problem hid the next's and each fix cost another full run
if (failures.length > 0) {
  for (const { label, output } of failures) {
    process.stderr.write(`\n${'─'.repeat(72)}\n${label}\n${'─'.repeat(72)}\n${output}\n`);
  }
  process.stderr.write(`\n❌ ${failures.length} failed: ${failures.map(({ label }) => label).join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\n✅ ${trees.length} published trees check out\n`);
}
