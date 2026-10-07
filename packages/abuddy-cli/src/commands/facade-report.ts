// `abuddy facade-report [--update]` — the reviewed report of a pack's facade types (etc/pack-types.api.md).
//
// `abuddy build` bundles a pack's facade into dist/types/pack-types.d.ts, which packs depending on this one
// compile against. **This re-takes that bundle rather than reading it**: codegen, then the same
// `bundlePackTypes` the build runs, into a directory of its own — so the report is compared against the
// facade the pack's sources describe now, and a `dist` built from older sources cannot be mistaken for the
// subject. It needs no build to have run, and `--update` writes a committed file off the same evidence.
//
// That is what root CLAUDE.md's taxonomy calls a derivation, and the reason it is one rather than a staleness
// record: a record of what the build read would be a proxy, whose remedy is a write, and the measurement that
// made the question easy is that re-bundling default-setup's facade costs 2.4s against `api:check`'s 6.9s.
//
// A command rather than a repo script, which is what it was: it reads one pack's sources and writes that
// pack's etc, the same shape as `abuddy validate` and `abuddy build`. As a script it could not share code with
// the bundler that produces its subject, and the normalisation it needs ended up in a third package to be
// reachable from both; `build/facade-report.ts` is that shared half, which `abuddy build` reads too.
// **One pack has a committed report today.** `abuddy init` scaffolds no `etc/`, so a pack's report appears at
// its first `facade:update`, and default-setup's `facade:check`/`facade:update` are the only invocations here.
// The open question is not a missing test: a pack with dependents publishes a facade the same way
// default-setup does, so either the scaffold or the release preflight should offer this, or the command is
// default-setup's alone and should say so. Adding coverage for a workflow nobody has would settle it by
// accident, which is why it has not been added.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compareFacadeReport, facadeReportFile, facadeReportText, shownPath } from '../build/facade-report';
import { bundlePackTypes } from '../build/types-bundler';
import { generateEntries } from './generate-entries';
import { findPackRoot } from '../utils';

export async function facadeReport(args: string[]): Promise<void> {
  const update = args.includes('--update');
  const packDir = findPackRoot(process.cwd());
  const reportFile = facadeReportFile(packDir);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-report-'));

  // The generated barrel the facade is bundled from, regenerated first: it skips on a matching `.inputs-hash`
  // in milliseconds and resolves its own dependencies, so this closes the one input a re-bundle alone would
  // still read as whatever was last written — a manifest change nobody regenerated for
  await generateEntries([]);
  // Into the scratch directory, never dist/: that is the build's output, and a check that wrote it would both
  // claim a build had run and race one that had
  const built = await bundlePackTypes(packDir, path.join(scratch, 'pack-types.d.ts'));
  if (!built.success) throw new Error(`The pack's facade types couldn't be bundled: ${built.error}`);

  const { id } = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8')) as { id: string };
  const next = facadeReportText(built.content, packDir, id);
  const comparison = compareFacadeReport(packDir, next);

  if (comparison.state === 'current') {
    console.log(`${shownPath(reportFile)} is up to date`);
    return;
  }
  if (update) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, next);
    console.log(`Updated ${shownPath(reportFile)}`);
    return;
  }
  // The diff is the useful half of the failure, so it is printed before the throw that sets the exit code.
  // It is the command's to print and not the comparison's: the build warns with the same sentence, where a
  // few thousand lines of diff nobody asked for is noise
  if (comparison.state === 'stale') {
    const derived = path.join(scratch, 'pack-types.api.md');
    fs.writeFileSync(derived, next);
    spawnSync('diff', ['-u', reportFile, derived], { stdio: 'inherit' });
  }
  throw new Error(`\n${comparison.problem}`);
}
