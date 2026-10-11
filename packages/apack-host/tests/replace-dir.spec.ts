/**
 * `replaceDir` is the one swap the installer and all six derived-tree builds share, and until it was extracted
 * its only coverage was `placePack`'s — where the staging directory and the destination share a parent, so the
 * one decision this module makes of its own was unobservable.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replaceDir } from '../src/replace-dir.ts';

/** The shape every build caller has: a staging directory off in a place the caller has arranged to be ignored */
function tree(): { root: string; staged: string; dest: string; stagingParent: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-dir-'));
  const stagingParent = path.join(root, '.temp');
  const staged = path.join(stagingParent, 'build');
  const dest = path.join(root, 'dist');
  fs.mkdirSync(staged, { recursive: true });
  fs.writeFileSync(path.join(staged, 'new.js'), 'new');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'old.js'), 'old');
  return { root, staged, dest, stagingParent };
}

const entries = (dir: string) => fs.readdirSync(dir).sort();


describe('replaceDir', () => {
  it('puts the staged tree at the destination and takes the previous one with it', () => {
    const { staged, dest } = tree();
    replaceDir(staged, dest);
    expect(entries(dest)).toEqual(['new.js']);
    expect(fs.existsSync(staged)).toBe(false);
  });

  it('writes into a destination that was not there', () => {
    const { staged, dest } = tree();
    fs.rmSync(dest, { recursive: true });
    replaceDir(staged, dest);
    expect(entries(dest)).toEqual(['new.js']);
  });

  /**
   * The window this closes is two renames long, which is too short to sample from outside — so what is asserted
   * is the half that is observable: when it is over, neither directory holds anything but what it should. A
   * leftover aside-copy fails this wherever it was left.
   */
  it('leaves nothing behind in either directory', () => {
    const { root, staged, dest, stagingParent } = tree();
    replaceDir(staged, dest);
    expect(entries(root)).toEqual(['.temp', 'dist']);
    expect(entries(stagingParent)).toEqual([]);
  });

  it('removes the staged tree and leaves the destination alone when the move fails', () => {
    const { staged, dest } = tree();
    fs.rmSync(staged, { recursive: true });
    expect(() => replaceDir(staged, dest)).toThrow();
    expect(entries(dest)).toEqual(['old.js']);
  });

  /**
   * **Where the aside-copy goes**, asked on the one path that leaves one on disk: the old tree cannot be
   * removed, so the swap stands and the tree it replaced stays. A caller stages somewhere it has arranged to be
   * ignored, and the directory holding the destination is usually tracked — so an aside-copy beside the
   * destination is a directory `git ls-files -co` reports for as long as a build runs, which is the population
   * eight of this repo's specs derive from.
   *
   * It is also the case for the other half of that path: the swap has already happened when the removal fails,
   * so failing the call would report a build that did not happen and have its caller drop a stamp describing
   * the tree now in place.
   */
  it('keeps the previous tree beside the staged one when it cannot be removed, and still reports the swap', () => {
    const { root, staged, dest, stagingParent } = tree();
    // A sub-directory nothing may unlink from. Not `dest` itself: renaming a directory rewrites its `..`, so
    // taking write permission off it would stop the first rename rather than the removal after the last
    const locked = path.join(dest, 'locked');
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, 'pinned.js'), 'pinned');
    fs.chmodSync(locked, 0o500);
    const aside = (dir: string) => entries(dir).filter((e) => e.includes('.previous-'));
    try {
      replaceDir(staged, dest);
      expect(entries(dest), 'the swap stands — a leftover is litter, not a failure').toEqual(['new.js']);
      expect(aside(stagingParent), 'the previous tree is kept beside the staged one').toHaveLength(1);
      expect(aside(root), 'nothing is left in the directory holding the destination').toEqual([]);
      expect(entries(path.join(stagingParent, aside(stagingParent)[0], 'locked'))).toEqual(['pinned.js']);
    } finally {
      for (const d of aside(stagingParent)) fs.chmodSync(path.join(stagingParent, d, 'locked'), 0o700);
    }
  });
});
