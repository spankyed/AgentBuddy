// Putting a built directory in place of the one before it, without a moment where neither is there.
//
// The mechanism, not the policy: where a caller stages its work and what it calls the staging directory are
// the caller's. `placePack` is one (an installed pack replaced by a newly staged one), the package builds are
// another (`dist` and the staged publish tree), and `abuddy build` a third (a pack's own `dist`).
//
// **Why anything needs this.** A tree that is cleared and refilled does not exist for the length of the
// build, and every reader of a derived tree in this repo treats absent as *not built* — so a build publishes
// a window in which its output is a lie. Renaming into place closes it: a reader sees the previous build whole
// or the new one whole.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type StagingKind = 'installing' | 'previous';

/**
 * **The format of a staging directory's name, with the one thing that reads it beside it**: `.<id>.<kind>-<pid>`
 * or `.<id>.<kind>-<pid>-<random>`, unique per process, so a crashed process's leftovers never collide with a
 * later process that reuses its pid. `recoverStagingDirs` (`packs/staging.ts`) is the reader — it takes the pid
 * back out to decide whether a leftover belongs to a process that is gone.
 *
 * Here rather than there because this is the module that makes one, and because a pack's staging recovery
 * reaches the SDK and the host's own data dirs: with the format over there, every package build imported that
 * whole closure through one three-line string function, and the five build units had to declare it.
 */
export const OWNED_STAGING_DIR = /^\.(.+)\.(installing|previous)-(\d+)(?:-[A-Za-z0-9]+)?$/;

/** A staging directory name for `id`, unique to this process */
export function stagingDirName(id: string, kind: StagingKind): string {
  return `.${id}.${kind}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Moves `staged` to `dest`, keeping whatever is at `dest` until the move has succeeded.
 *
 * **It never renames onto an existing directory**, because that is not a portable operation: `fs.renameSync`
 * onto a directory "either throws or replaces depending on the platform and whether it is empty, and neither
 * is an answer to 'rename this'" (`abuddy-cli/src/app/instances.ts`). So the old tree is moved aside first,
 * and the window this leaves — `dest` absent between two renames — is the one `recoverStagingDirs` repairs
 * for a pack, and the one a build simply redoes.
 *
 * `staged` must be on the same filesystem as `dest`, which every caller gets by staging inside the directory
 * it is publishing into. A rename across filesystems fails with `EXDEV` and there is no atomic answer to it.
 *
 * **The old tree is moved aside next to `staged`, not next to `dest`**, and that is not tidiness. A caller's
 * staging directory is somewhere it has arranged to be ignorable — `.temp/` for a package build, `.abuddy/`
 * for a pack's — whereas the directory holding `dest` is usually tracked, and a `.dist.previous-*` appearing
 * there for the length of two renames is a directory that `git ls-files -co` reports: the population eight of
 * this repo's specs derive from. Beside `staged` it is on the same filesystem by the same argument as above
 * and ignored by the one the caller already made. For `placePack` the two are the same directory anyway.
 *
 * Throws with `staged` removed and `dest` untouched, so a failed build leaves the previous one in place —
 * which is the half that makes this worth doing rather than merely tidier.
 */
export function replaceDir(staged: string, dest: string): void {
  const parent = path.dirname(staged);
  try {
    // Named for what it is and whose it is: `recoverStagingDirs` reads the pid to decide whether a leftover
    // belongs to a process that is gone, and the random suffix is what stops a recycled pid colliding with it
    const previous = fs.existsSync(dest) ? path.join(parent, stagingDirName(path.basename(dest), 'previous')) : null;
    if (previous) fs.renameSync(dest, previous);
    try {
      fs.renameSync(staged, dest);
    } catch (err) {
      // Put the old tree back rather than leaving nothing there. Guarded, because a racer that took `dest`
      // between the two renames owns it now, and overwriting it would be the failure this exists to prevent
      if (previous && !fs.existsSync(dest)) fs.renameSync(previous, dest);
      throw err;
    }
    // Outside the guarded region, and best-effort: by here the swap has happened, so a failure to remove the
    // tree it replaced is litter rather than a failed publish — throwing would report a build that did not
    // happen and have its caller drop a stamp that describes the tree now in place. A leftover is named for
    // its maker, so `recoverStagingDirs` collects a pack's and a build's sits in an ignored staging directory.
    if (previous) try { fs.rmSync(previous, { recursive: true, force: true }); } catch { /* litter */ }
  } catch (err) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  }
}
