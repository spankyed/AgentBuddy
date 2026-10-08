// What `abuddy clean --apps` deletes, which is the only branch of this command that removes something a
// person did not build in the directory they are standing in: downloaded AgentBuddy Beta builds, a few
// hundred megabytes each, which nothing reclaimed before.
//
// It takes a `dirs` rather than reading `cliDirs()` as `cleanInstances` does, so these run against a temp
// cache. A case that exercised the real one would delete the builds on this machine.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanApps } from '../../src/commands/clean';
import { betaCacheDir, packagedExecutable } from '../../src/app/beta-app';
import type { CliDirs } from '../../src/app/app-target';

let tmp: string;
let dirs: CliDirs;

/** A downloaded build, with a file in it so it has a size to report */
const build = (tag: string): string => {
  const dir = path.join(betaCacheDir(dirs.cache), tag);
  const executable = packagedExecutable(dir);
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'x'.repeat(1024));
  return dir;
};

const tags = (): string[] => {
  const root = betaCacheDir(dirs.cache);
  return fs.existsSync(root) ? fs.readdirSync(root).sort() : [];
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-clean-'));
  dirs = { cache: path.join(tmp, 'cache'), data: path.join(tmp, 'data') };
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('abuddy clean --apps', () => {
  /**
   * The newest survives, because resolution prefers a cached build: `cachedBetaApp` answers from the cache
   * whenever one satisfies the pack's range, so emptying it would turn every later run into a download.
   */
  it('keeps the newest build and removes the rest', () => {
    for (const tag of ['0.4.0-beta.1', '0.4.0-beta.10', '0.3.9']) build(tag);

    cleanApps(false, dirs);

    expect(tags()).toEqual(['0.4.0-beta.10']);
  });

  // Moving to a newer Beta is deleting the one you have, so there has to be a way to delete all of them
  it('removes every build with --all', () => {
    for (const tag of ['0.4.0-beta.1', '0.4.0-beta.10']) build(tag);

    cleanApps(true, dirs);

    expect(tags()).toEqual([]);
  });

  /**
   * A download killed mid-extract leaves a staging directory that nothing ever reads again —
   * `cachedBetaBuilds` filters it out by name — so it is litter whichever flag is passed, and this is the
   * only thing that removes it.
   */
  it('removes an interrupted download whatever the flag says, and keeps the build beside it', () => {
    build('0.4.0-beta.10');
    const staging = path.join(betaCacheDir(dirs.cache), '.0.5.0-beta.0.download-abc');
    fs.mkdirSync(staging, { recursive: true });

    cleanApps(false, dirs);

    expect(tags()).toEqual(['0.4.0-beta.10']);
  });

  it('says so when there is nothing downloaded, rather than failing on a missing cache', () => {
    expect(() => cleanApps(true, dirs)).not.toThrow();
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('no downloaded app builds');
  });
});
