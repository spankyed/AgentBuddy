/**
 * The files this repo has: the working tree as it would be committed.
 *
 * **Not the index, which is a different question and the one that kept being asked by accident.** `git ls-files`
 * alone answers "what does the index hold", and the two differ in both directions:
 *
 * - **deleted, not staged** — in the index, not on disk. A caller that reads what the walk returns throws
 *   `ENOENT`. Measured: deleting one tracked spec and running this package's fast half gave nine failures, four
 *   of them crashes. Staging the deletion made them pass, which is what made it look like a flake.
 * - **new, not staged** — on disk, not in the index. Every check here would skip it: its placement, its imports,
 *   its cost record, its row in this package's CLAUDE.md. Silent, and at exactly the moment those answers are
 *   cheapest to act on.
 *
 * `-co --exclude-standard` is tracked plus untracked minus gitignored, and the `existsSync` filter drops the
 * deleted half, so both directions come out right. `.gitignore` is honoured, so a scratch file in
 * `tests/e2e/scratch` stays invisible; a scratch file anywhere else is one the checks should be talking about.
 *
 * `identity-guard.spec.ts` had its own copy of this while it lived in `@apack/sdk`, since
 * `repo-check-boundary` refuses the cross-package import that would have shared it. It is here now, and
 * uses this.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@apack/host/build/packages-built';

export function repoFiles(...patterns: string[]): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', ...patterns],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n')
    .filter((file) => file !== '' && fs.existsSync(path.join(REPO_ROOT, file)));
}
