import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** Locate the primary checkout without assuming its Git metadata lives in .git. @param {string} root */
export function primaryWorktree(root) {
  /** @param {string[]} args */
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const common = realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (common === realpathSync(git(['rev-parse', '--absolute-git-dir']))) return realpathSync(root);
  // Git's worktree list assumes ordinary metadata placement even when core.worktree overrides it.
  try {
    const configured = git(['config', '--file', path.join(common, 'config'), '--get', 'core.worktree']);
    return realpathSync(path.resolve(common, configured));
  } catch (error) {
    if (/** @type {{status?: number}} */ (error).status !== 1) throw error;
  }
  const listing = git(['worktree', 'list', '--porcelain', '-z']);
  const first = listing.split('\0')[0];
  if (!first.startsWith('worktree ')) throw new Error('Git did not report a primary worktree.');
  return realpathSync(first.slice('worktree '.length));
}
