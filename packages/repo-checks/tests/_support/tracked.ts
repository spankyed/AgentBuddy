/**
 * The repo's tracked files that are actually on disk.
 *
 * `git ls-files` answers "what does the index hold", and every caller here means "what files are there". The two
 * differ for a file deleted from the worktree and not yet staged: the index still holds it, so the walk hands
 * back a path that `readFileSync` throws `ENOENT` on. Measured — deleting one tracked spec and running this
 * package's fast half produced nine failures, four of them that crash and five of them phantom findings telling
 * you to edit recorded artifacts that were fine. Staging the deletion made them all pass, which is what made it
 * look like a flake.
 *
 * The ordinary workflow that hits it is deleting or renaming a spec and running the suite before committing.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

export function trackedFiles(...patterns: string[]): string[] {
  return execFileSync('git', ['ls-files', ...patterns], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n')
    .filter((file) => file !== '' && fs.existsSync(path.join(REPO_ROOT, file)));
}
