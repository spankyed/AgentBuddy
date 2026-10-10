import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  profileDir,
  profileFor,
  profileNameProblem,
  listProfiles,
  mintProfile,
  openProfile,
  parseProfileFlags,
  removeProfile,
  renameProfile,
} from '../../src/app/profiles';
import type { CliDirs } from '../../src/app/app-target';
import { resolveAppContext } from '@abuddy/sdk/env';

let tmp: string;
let dirs: CliDirs;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-profiles-'));
  dirs = { cache: path.join(tmp, 'cache'), data: path.join(tmp, 'data') };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const root = () => path.join(dirs.data, 'profiles');

/**
 * A name reaches `path.join`, and for an ephemeral profile it reaches `fs.rm`. The user's rule for this
 * whole feature is that production data is never touched by it, and an unchecked name is the one way it
 * could be: `--profile ../../abuddy` is the real production data dir on macOS.
 */
describe('a profile name', () => {
  it('cannot climb out of the profiles directory', () => {
    for (const name of ['../../abuddy', '../abuddy-dev', 'a/b', 'a\\b', '..', '.', '']) {
      expect(() => profileDir(dirs, name), name).toThrow();
    }
  });

  it('refuses names a filesystem would mangle', () => {
    expect(profileNameProblem('con')).toMatch(/reserved/);
    expect(profileNameProblem('trailing.')).toMatch(/reserved/);
    expect(profileNameProblem('-leading')).toMatch(/usable/);
    expect(profileNameProblem('x'.repeat(65))).toMatch(/usable/);
  });

  it('takes the ordinary ones', () => {
    for (const name of ['probe', 'my-pack.2', 'A_1']) expect(profileNameProblem(name), name).toBeUndefined();
  });
});

describe('opening a profile', () => {
  it('creates it the first time and reuses it after', () => {
    const first = openProfile(dirs, 'probe');
    fs.writeFileSync(path.join(first.dir, 'marker'), 'x');
    const again = openProfile(dirs, 'probe');
    expect(again.dir).toBe(first.dir);
    expect(fs.existsSync(path.join(again.dir, 'marker')), 'reopening must not wipe it').toBe(true);
  });

  it('mints a named profile whose name can be used again', () => {
    const minted = mintProfile(dirs, false);
    expect(profileNameProblem(minted.name), 'a minted name has to be one --profile accepts').toBeUndefined();
    expect(openProfile(dirs, minted.name).dir).toBe(minted.dir);
  });
});

describe('ephemeral profiles', () => {
  it('are kept apart from named ones, so reclaiming by pid cannot eat a name', () => {
    const ephemeral = mintProfile(dirs, true);
    expect(path.dirname(ephemeral.dir)).toBe(path.join(root(), '.ephemeral'));
    expect(listProfiles(dirs).filter(i => !i.ephemeral), 'it is not a named profile').toEqual([]);
  });

  it('count as leaked only once the run that made them has gone', () => {
    mintProfile(dirs, true);
    expect(listProfiles(dirs)[0], 'this process is still alive').toMatchObject({ ephemeral: true, leaked: false });

    // A dir left by a run that is no longer here, which is what a crash leaves
    const dead = path.join(root(), '.ephemeral', '999999-gone');
    fs.mkdirSync(dead, { recursive: true });
    fs.writeFileSync(path.join(dead, '.abuddy-profile.json'), JSON.stringify({ kind: 'source', created: '', pid: 999999 }));
    expect(listProfiles(dirs).find(i => i.name === '999999-gone')).toMatchObject({ leaked: true });
  });
});

/**
 * What may be removed is a profile, and the guard is phrased that way rather than as "inside the
 * root" — a containment rule admits a container for every level it does not enumerate, and this one
 * admitted two in turn: the root, which holds every profile, and `.ephemeral`, which holds every
 * throwaway one. Neither had a caller; each was one future caller away from deleting everything.
 */
describe('what removing accepts', () => {
  it('takes a named profile and an ephemeral one, which is what every caller passes', () => {
    const named = openProfile(dirs, 'keep-me');
    const ephemeral = mintProfile(dirs, true);
    removeProfile(dirs, named.dir);
    removeProfile(dirs, ephemeral.dir);
    expect(fs.existsSync(named.dir)).toBe(false);
    expect(fs.existsSync(ephemeral.dir)).toBe(false);
  });

  it('refuses the profiles root, and every profile under it survives', () => {
    const named = openProfile(dirs, 'keep-me');
    expect(() => removeProfile(dirs, root())).toThrow(/the profiles directory itself/);
    expect(fs.existsSync(named.dir)).toBe(true);
  });

  it('refuses the directory the ephemeral ones live in, and they survive', () => {
    const one = mintProfile(dirs, true);
    const two = mintProfile(dirs, true);
    expect(() => removeProfile(dirs, path.dirname(one.dir))).toThrow(/every ephemeral profile lives/);
    expect(fs.existsSync(one.dir) && fs.existsSync(two.dir)).toBe(true);
  });

  it('refuses a directory inside a profile, which is data rather than a profile', () => {
    const named = openProfile(dirs, 'keep-me');
    expect(() => removeProfile(dirs, path.join(named.dir, 'packs'))).toThrow(/a profile is a directory/);
  });

  it('refuses anything outside, and leaves it alone', () => {
    const outside = path.join(tmp, 'not-an-profile');
    fs.mkdirSync(outside, { recursive: true });
    expect(() => removeProfile(dirs, outside)).toThrow(/is not inside/);
    expect(fs.existsSync(outside)).toBe(true);
  });

  // `path.relative` renders a sibling of the root as `../<name>`, which splits into two segments and
  // would pass a check that only counted them
  it('refuses a sibling of the root whose relative path looks like a nested profile', () => {
    const sibling = path.join(dirs.data, 'profiles-old');
    fs.mkdirSync(sibling, { recursive: true });
    expect(() => removeProfile(dirs, sibling)).toThrow(/is not inside/);
    expect(fs.existsSync(sibling)).toBe(true);
  });
});

describe('renaming a profile', () => {
  it('moves the directory and leaves the name free', () => {
    const made = openProfile(dirs, 'memo-work');
    fs.writeFileSync(path.join(made.dir, 'proof'), 'x');

    const { dir } = renameProfile(dirs, 'memo-work', 'memos');

    expect(dir).toBe(path.join(root(), 'memos'));
    expect(fs.readFileSync(path.join(dir, 'proof'), 'utf-8')).toBe('x');
    expect(fs.existsSync(made.dir)).toBe(false);
  });

  /**
   * Refused rather than merged into: `fs.renameSync` onto a directory throws or replaces depending on the
   * platform and whether the target is empty, and neither is an answer to "rename this".
   */
  it('refuses a target that already exists, and moves nothing', () => {
    openProfile(dirs, 'one');
    openProfile(dirs, 'two');

    expect(() => renameProfile(dirs, 'one', 'two')).toThrow(/already exists/);
    expect(fs.existsSync(path.join(root(), 'one'))).toBe(true);
  });

  it('refuses a target name a filesystem would mangle', () => {
    openProfile(dirs, 'one');
    expect(() => renameProfile(dirs, 'one', '../escape')).toThrow(/profile name/);
    expect(fs.existsSync(path.join(root(), 'one'))).toBe(true);
  });

  it('says so when there is nothing by that name', () => {
    expect(() => renameProfile(dirs, 'absent', 'present')).toThrow(/No profile named "absent"/);
  });

  // The same refusal `removeProfile` carries, one step worse: a running app holds paths inside the
  // directory, so moving it leaves the app writing somewhere that no longer exists
  it('refuses while an app has it open', () => {
    const live = openProfile(dirs, 'live');
    const { apiPortFile } = resolveAppContext({ env: 'development', userDataDir: live.dir });
    fs.mkdirSync(path.dirname(apiPortFile), { recursive: true });
    fs.writeFileSync(apiPortFile, JSON.stringify({ port: 51234, pid: process.pid }));

    expect(() => renameProfile(dirs, 'live', 'moved')).toThrow(/An app is running on/);
    expect(fs.existsSync(live.dir)).toBe(true);
  });
});

describe('the flags', () => {
  it('take the profile ones out and leave the rest for the app parser', () => {
    expect(parseProfileFlags(['--profile', 'probe', '--app-root', '/repo']))
      .toEqual({ mode: { kind: 'named', name: 'probe' }, withSecrets: false, rest: ['--app-root', '/repo'] });
    expect(parseProfileFlags(['--profile=probe']).mode).toEqual({ kind: 'named', name: 'probe' });
    expect(parseProfileFlags(['--fresh']).mode).toEqual({ kind: 'fresh', rm: false });
    expect(parseProfileFlags([]).mode).toEqual({ kind: 'shared' });
  });

  /**
   * `--rm` is a modifier on `--fresh` rather than a mode of its own, which is the whole of the change from
   * `--ephemeral`: one flag mints the dir and the second decides whether it survives.
   */
  it('read --rm as a modifier on --fresh, in either order', () => {
    expect(parseProfileFlags(['--fresh', '--rm']).mode).toEqual({ kind: 'fresh', rm: true });
    expect(parseProfileFlags(['--rm', '--fresh']).mode).toEqual({ kind: 'fresh', rm: true });
  });

  // Without `--fresh` there is no directory this command made, so the flag has nothing to remove. The two
  // things it could otherwise be read as are `abuddy profiles rm <name>` and something nothing should spell
  it('refuse --rm on its own, naming what does remove a named profile', () => {
    expect(() => parseProfileFlags(['--rm'])).toThrow(/goes with --fresh/);
    expect(() => parseProfileFlags(['--rm'])).toThrow(/abuddy profiles rm/);
    expect(() => parseProfileFlags(['--profile', 'probe', '--rm'])).toThrow(/goes with --fresh/);
  });

  it('refuse two at once, which would silently pick one', () => {
    expect(() => parseProfileFlags(['--profile', 'a', '--fresh'])).toThrow();
  });

  // --with-secrets is orthogonal to which profile, so it rides alongside the mode rather than inside it
  it('carries --with-secrets beside the mode', () => {
    expect(parseProfileFlags(['--fresh', '--rm', '--with-secrets']))
      .toEqual({ mode: { kind: 'fresh', rm: true }, withSecrets: true, rest: [] });
    expect(parseProfileFlags(['--profile', 'probe']).withSecrets).toBe(false);
  });

  // The shared data dir already holds them, so there is nothing to copy into: a silent no-op here would
  // read as if it had done something
  it('refuses --with-secrets with no profile to copy into', () => {
    expect(() => parseProfileFlags(['--with-secrets'])).toThrow(/needs a profile/);
  });

  it('needs a name for --profile', () => {
    expect(() => parseProfileFlags(['--profile'])).toThrow(/needs a name/);
  });

  // The default has to stay the shared dev dir: `run` with no flag must behave exactly as it did
  it('resolve nothing for the shared default', () => {
    expect(profileFor({ kind: 'shared' }, dirs)).toBeUndefined();
  });

  /**
   * `--fresh --rm` removes what `--fresh` keeps, which is the one behavioural claim in this rename. The
   * two land in different places on disk and that is what decides it: `.ephemeral/` is where a run's own
   * teardown looks, and `ephemeral` on the result is what tells it to. A `--fresh` that minted into
   * `.ephemeral` would be removed by the run that made it, having promised a name to come back to.
   */
  it('mint a kept profile and a removed one in different places', () => {
    const kept = profileFor({ kind: 'fresh', rm: false }, dirs)!;
    const removed = profileFor({ kind: 'fresh', rm: true }, dirs)!;

    expect(kept.ephemeral).toBe(false);
    expect(path.dirname(kept.dir)).toBe(root());
    expect(removed.ephemeral).toBe(true);
    expect(path.dirname(removed.dir)).toBe(path.join(root(), '.ephemeral'));
    // The kept one is reachable by the name it printed; the removed one is not named for coming back to
    expect(listProfiles(dirs).filter((profile) => !profile.ephemeral).map((profile) => profile.name)).toEqual([kept.name]);
  });
});

/**
 * The app outlives the `abuddy run` that started it, so the run's pid is not enough to call a directory
 * abandoned. Found by killing a run, reclaiming what looked like its leak, and watching the app that was
 * still going rebuild the directory underneath — the removal had only corrupted what was in it.
 */
describe('a profile an app still has open', () => {
  // Where the API actually publishes it, asked of the same resolver the app uses — a literal path here is a
  // second guess, and the one time it disagreed with the app this assertion still passed
  const publishApi = (dir: string, pid: number) => {
    const { apiPortFile } = resolveAppContext({ env: 'development', userDataDir: dir });
    fs.mkdirSync(path.dirname(apiPortFile), { recursive: true });
    fs.writeFileSync(apiPortFile, JSON.stringify({ port: 51234, pid }));
  };

  it('is in use, and not a leak, even when the run that made it has gone', () => {
    const dead = path.join(root(), '.ephemeral', '999999-gone');
    fs.mkdirSync(dead, { recursive: true });
    fs.writeFileSync(path.join(dead, '.abuddy-profile.json'), JSON.stringify({ kind: 'source', created: '', pid: 999999 }));
    publishApi(dead, process.pid);

    expect(listProfiles(dirs)[0]).toMatchObject({ inUse: true, leaked: false });
  });

  it('refuses to be removed', () => {
    const live = openProfile(dirs, 'live');
    publishApi(live.dir, process.pid);
    expect(() => removeProfile(dirs, live.dir)).toThrow(/An app is running on/);
    expect(fs.existsSync(live.dir)).toBe(true);
  });
});
