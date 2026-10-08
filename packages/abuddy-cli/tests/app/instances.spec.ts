import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  instanceDir,
  instanceFor,
  instanceNameProblem,
  listInstances,
  mintInstance,
  openInstance,
  parseInstanceFlags,
  removeInstance,
  renameInstance,
} from '../../src/app/instances';
import type { CliDirs } from '../../src/app/app-target';
import { resolveAppContext } from '@abuddy/sdk/env';

let tmp: string;
let dirs: CliDirs;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-instances-'));
  dirs = { cache: path.join(tmp, 'cache'), data: path.join(tmp, 'data') };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const root = () => path.join(dirs.data, 'instances');

/**
 * A name reaches `path.join`, and for an ephemeral instance it reaches `fs.rm`. The user's rule for this
 * whole feature is that production data is never touched by it, and an unchecked name is the one way it
 * could be: `--instance ../../abuddy` is the real production data dir on macOS.
 */
describe('an instance name', () => {
  it('cannot climb out of the instances directory', () => {
    for (const name of ['../../abuddy', '../abuddy-dev', 'a/b', 'a\\b', '..', '.', '']) {
      expect(() => instanceDir(dirs, name), name).toThrow();
    }
  });

  it('refuses names a filesystem would mangle', () => {
    expect(instanceNameProblem('con')).toMatch(/reserved/);
    expect(instanceNameProblem('trailing.')).toMatch(/reserved/);
    expect(instanceNameProblem('-leading')).toMatch(/usable/);
    expect(instanceNameProblem('x'.repeat(65))).toMatch(/usable/);
  });

  it('takes the ordinary ones', () => {
    for (const name of ['probe', 'my-pack.2', 'A_1']) expect(instanceNameProblem(name), name).toBeUndefined();
  });
});

describe('opening an instance', () => {
  it('creates it the first time and reuses it after', () => {
    const first = openInstance(dirs, 'probe');
    fs.writeFileSync(path.join(first.dir, 'marker'), 'x');
    const again = openInstance(dirs, 'probe');
    expect(again.dir).toBe(first.dir);
    expect(fs.existsSync(path.join(again.dir, 'marker')), 'reopening must not wipe it').toBe(true);
  });

  it('mints a named instance whose name can be used again', () => {
    const minted = mintInstance(dirs, false);
    expect(instanceNameProblem(minted.name), 'a minted name has to be one --instance accepts').toBeUndefined();
    expect(openInstance(dirs, minted.name).dir).toBe(minted.dir);
  });
});

describe('ephemeral instances', () => {
  it('are kept apart from named ones, so reclaiming by pid cannot eat a name', () => {
    const ephemeral = mintInstance(dirs, true);
    expect(path.dirname(ephemeral.dir)).toBe(path.join(root(), '.ephemeral'));
    expect(listInstances(dirs).filter(i => !i.ephemeral), 'it is not a named instance').toEqual([]);
  });

  it('count as leaked only once the run that made them has gone', () => {
    mintInstance(dirs, true);
    expect(listInstances(dirs)[0], 'this process is still alive').toMatchObject({ ephemeral: true, leaked: false });

    // A dir left by a run that is no longer here, which is what a crash leaves
    const dead = path.join(root(), '.ephemeral', '999999-gone');
    fs.mkdirSync(dead, { recursive: true });
    fs.writeFileSync(path.join(dead, '.abuddy-instance.json'), JSON.stringify({ kind: 'source', created: '', pid: 999999 }));
    expect(listInstances(dirs).find(i => i.name === '999999-gone')).toMatchObject({ leaked: true });
  });
});

/**
 * What may be removed is an instance, and the guard is phrased that way rather than as "inside the
 * root" — a containment rule admits a container for every level it does not enumerate, and this one
 * admitted two in turn: the root, which holds every instance, and `.ephemeral`, which holds every
 * throwaway one. Neither had a caller; each was one future caller away from deleting everything.
 */
describe('what removing accepts', () => {
  it('takes a named instance and an ephemeral one, which is what every caller passes', () => {
    const named = openInstance(dirs, 'keep-me');
    const ephemeral = mintInstance(dirs, true);
    removeInstance(dirs, named.dir);
    removeInstance(dirs, ephemeral.dir);
    expect(fs.existsSync(named.dir)).toBe(false);
    expect(fs.existsSync(ephemeral.dir)).toBe(false);
  });

  it('refuses the instances root, and every instance under it survives', () => {
    const named = openInstance(dirs, 'keep-me');
    expect(() => removeInstance(dirs, root())).toThrow(/the instances directory itself/);
    expect(fs.existsSync(named.dir)).toBe(true);
  });

  it('refuses the directory the ephemeral ones live in, and they survive', () => {
    const one = mintInstance(dirs, true);
    const two = mintInstance(dirs, true);
    expect(() => removeInstance(dirs, path.dirname(one.dir))).toThrow(/every ephemeral instance lives/);
    expect(fs.existsSync(one.dir) && fs.existsSync(two.dir)).toBe(true);
  });

  it('refuses a directory inside an instance, which is data rather than an instance', () => {
    const named = openInstance(dirs, 'keep-me');
    expect(() => removeInstance(dirs, path.join(named.dir, 'packs'))).toThrow(/an instance is a directory/);
  });

  it('refuses anything outside, and leaves it alone', () => {
    const outside = path.join(tmp, 'not-an-instance');
    fs.mkdirSync(outside, { recursive: true });
    expect(() => removeInstance(dirs, outside)).toThrow(/is not inside/);
    expect(fs.existsSync(outside)).toBe(true);
  });

  // `path.relative` renders a sibling of the root as `../<name>`, which splits into two segments and
  // would pass a check that only counted them
  it('refuses a sibling of the root whose relative path looks like a nested instance', () => {
    const sibling = path.join(dirs.data, 'instances-old');
    fs.mkdirSync(sibling, { recursive: true });
    expect(() => removeInstance(dirs, sibling)).toThrow(/is not inside/);
    expect(fs.existsSync(sibling)).toBe(true);
  });
});

describe('renaming an instance', () => {
  it('moves the directory and leaves the name free', () => {
    const made = openInstance(dirs, 'memo-work');
    fs.writeFileSync(path.join(made.dir, 'proof'), 'x');

    const { dir } = renameInstance(dirs, 'memo-work', 'memos');

    expect(dir).toBe(path.join(root(), 'memos'));
    expect(fs.readFileSync(path.join(dir, 'proof'), 'utf-8')).toBe('x');
    expect(fs.existsSync(made.dir)).toBe(false);
  });

  /**
   * Refused rather than merged into: `fs.renameSync` onto a directory throws or replaces depending on the
   * platform and whether the target is empty, and neither is an answer to "rename this".
   */
  it('refuses a target that already exists, and moves nothing', () => {
    openInstance(dirs, 'one');
    openInstance(dirs, 'two');

    expect(() => renameInstance(dirs, 'one', 'two')).toThrow(/already exists/);
    expect(fs.existsSync(path.join(root(), 'one'))).toBe(true);
  });

  it('refuses a target name a filesystem would mangle', () => {
    openInstance(dirs, 'one');
    expect(() => renameInstance(dirs, 'one', '../escape')).toThrow(/instance name/);
    expect(fs.existsSync(path.join(root(), 'one'))).toBe(true);
  });

  it('says so when there is nothing by that name', () => {
    expect(() => renameInstance(dirs, 'absent', 'present')).toThrow(/No instance named "absent"/);
  });

  // The same refusal `removeInstance` carries, one step worse: a running app holds paths inside the
  // directory, so moving it leaves the app writing somewhere that no longer exists
  it('refuses while an app has it open', () => {
    const live = openInstance(dirs, 'live');
    const { apiPortFile } = resolveAppContext({ env: 'development', userDataDir: live.dir });
    fs.mkdirSync(path.dirname(apiPortFile), { recursive: true });
    fs.writeFileSync(apiPortFile, JSON.stringify({ port: 51234, pid: process.pid }));

    expect(() => renameInstance(dirs, 'live', 'moved')).toThrow(/An app is running on/);
    expect(fs.existsSync(live.dir)).toBe(true);
  });
});

describe('the flags', () => {
  it('take the instance ones out and leave the rest for the app parser', () => {
    expect(parseInstanceFlags(['--instance', 'probe', '--app-root', '/repo']))
      .toEqual({ mode: { kind: 'named', name: 'probe' }, withSecrets: false, rest: ['--app-root', '/repo'] });
    expect(parseInstanceFlags(['--instance=probe']).mode).toEqual({ kind: 'named', name: 'probe' });
    expect(parseInstanceFlags(['--fresh']).mode).toEqual({ kind: 'fresh' });
    expect(parseInstanceFlags(['--ephemeral']).mode).toEqual({ kind: 'ephemeral' });
    expect(parseInstanceFlags([]).mode).toEqual({ kind: 'shared' });
  });

  it('refuse two at once, which would silently pick one', () => {
    expect(() => parseInstanceFlags(['--fresh', '--ephemeral'])).toThrow();
    expect(() => parseInstanceFlags(['--instance', 'a', '--fresh'])).toThrow();
  });

  // --with-secrets is orthogonal to which instance, so it rides alongside the mode rather than inside it
  it('carries --with-secrets beside the mode', () => {
    expect(parseInstanceFlags(['--ephemeral', '--with-secrets']))
      .toEqual({ mode: { kind: 'ephemeral' }, withSecrets: true, rest: [] });
    expect(parseInstanceFlags(['--instance', 'probe']).withSecrets).toBe(false);
  });

  // The shared data dir already holds them, so there is nothing to copy into: a silent no-op here would
  // read as if it had done something
  it('refuses --with-secrets with no instance to copy into', () => {
    expect(() => parseInstanceFlags(['--with-secrets'])).toThrow(/needs an instance/);
  });

  it('needs a name for --instance', () => {
    expect(() => parseInstanceFlags(['--instance'])).toThrow(/needs a name/);
  });

  // The default has to stay the shared dev dir: `run` with no flag must behave exactly as it did
  it('resolve nothing for the shared default', () => {
    expect(instanceFor({ kind: 'shared' }, dirs)).toBeUndefined();
  });
});

/**
 * The app outlives the `abuddy run` that started it, so the run's pid is not enough to call a directory
 * abandoned. Found by killing a run, reclaiming what looked like its leak, and watching the app that was
 * still going rebuild the directory underneath — the removal had only corrupted what was in it.
 */
describe('an instance an app still has open', () => {
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
    fs.writeFileSync(path.join(dead, '.abuddy-instance.json'), JSON.stringify({ kind: 'source', created: '', pid: 999999 }));
    publishApi(dead, process.pid);

    expect(listInstances(dirs)[0]).toMatchObject({ inUse: true, leaked: false });
  });

  it('refuses to be removed', () => {
    const live = openInstance(dirs, 'live');
    publishApi(live.dir, process.pid);
    expect(() => removeInstance(dirs, live.dir)).toThrow(/An app is running on/);
    expect(fs.existsSync(live.dir)).toBe(true);
  });
});
