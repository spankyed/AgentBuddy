// What `abuddy instances` tells you, and what it does on the way.
//
// The environment rows come from an injected `resolve`, and the sizes from an injected `bytes`, because both
// questions are about the machine: asserting the real four dirs would make these cases say whatever this
// laptop happens to hold, and the one performance claim — that sizes are what cost, so they are opt-in —
// cannot be checked at all without watching whether the walk happens.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _appDirOf, type AppEnv } from '@abuddy/sdk/env';
import { create, environmentRows, list, remove } from '../../src/commands/instances';
import { listInstances, openInstance } from '../../src/app/instances';
import type { CliDirs } from '../../src/app/app-target';

let tmp: string;
let dirs: CliDirs;

/** Each environment under a temp root, so a case can create and skip them by name */
const resolve = (env: AppEnv): string => path.join(tmp, 'envs', env);
const bytes = vi.fn((_dir: string) => 1_500_000_000);

const printed = (): string => vi.mocked(console.log).mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-instances-cmd-'));
  dirs = { cache: path.join(tmp, 'cache'), data: path.join(tmp, 'data') };
  bytes.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the environment rows', () => {
  /**
   * An absent dir is a row, not an omission: that nothing has ever run that channel here is half the answer,
   * and a missing line reads as a bug in the listing.
   */
  it('names every environment, present or not', () => {
    fs.mkdirSync(resolve('production'), { recursive: true });

    const rows = environmentRows(resolve);

    expect(rows.map((row) => row.env)).toEqual(['production', 'beta', 'development', 'test']);
    expect(rows.find((row) => row.env === 'production')).toMatchObject({ exists: true });
    expect(rows.find((row) => row.env === 'beta')).toMatchObject({ exists: false, hasAppData: false });
  });

  /**
   * A data dir and a directory Electron left behind are not the same thing, and the difference is the app's
   * own folder inside it. Measured on the author's machine: `development` held 1.5GB of Chromium profile
   * and no app dir, which "exists, version unknown" describes badly.
   */
  it('tells a data dir from an Electron profile, and reads the version only from the former', () => {
    fs.mkdirSync(resolve('development'), { recursive: true });
    const withData = resolve('production');
    fs.mkdirSync(_appDirOf(withData), { recursive: true });
    fs.writeFileSync(path.join(_appDirOf(withData), 'host.json'), JSON.stringify({ version: '0.4.1' }));

    const rows = environmentRows(resolve);

    expect(rows.find((row) => row.env === 'production')).toMatchObject({ hasAppData: true, version: '0.4.1' });
    expect(rows.find((row) => row.env === 'development')).toMatchObject({ exists: true, hasAppData: false });
    // Absent rather than `undefined`: the row carries no version at all for a dir with no app data, and
    // `toMatchObject({ version: undefined })` would demand the key be there
    expect(rows.find((row) => row.env === 'development')).not.toHaveProperty('version');
  });
});

describe('new', () => {
  it('mints a name and says what to do with it', () => {
    create(dirs, undefined);

    const [made] = listInstances(dirs);
    expect(made).toBeDefined();
    expect(printed()).toContain(made!.name);
    expect(printed()).toContain(`abuddy run --instance ${made!.name}`);
  });

  /**
   * Refused rather than opened. `openInstance` exists for `run --instance x`, where reusing the dir you
   * named last time is the whole point; here it would hand you someone else's data under the impression you
   * had made something.
   */
  it('refuses a name that is taken, and leaves it alone', () => {
    const existing = openInstance(dirs, 'memo-work');
    fs.writeFileSync(path.join(existing.dir, 'proof'), 'x');

    expect(() => create(dirs, 'memo-work')).toThrow(/already exists/);
    expect(fs.readFileSync(path.join(existing.dir, 'proof'), 'utf-8')).toBe('x');
  });

  it('refuses a name a filesystem would mangle', () => {
    expect(() => create(dirs, '../escape')).toThrow(/instance name/);
  });
});

describe('rm', () => {
  /** What `clean --instances` did by default, which is the only thing anyone does to an ephemeral one */
  it('--leaked takes the ones a dead run left and nothing else', () => {
    openInstance(dirs, 'keep-me');
    const dead = path.join(dirs.data, 'instances', '.ephemeral', '999999-gone');
    fs.mkdirSync(dead, { recursive: true });
    fs.writeFileSync(path.join(dead, '.abuddy-instance.json'), JSON.stringify({ created: '', pid: 999999 }));

    remove(dirs, [], true);

    expect(listInstances(dirs).map((instance) => instance.name)).toEqual(['keep-me']);
  });

  it('says so when a name is not there, rather than removing nothing quietly', () => {
    expect(() => remove(dirs, ['absent'], false)).toThrow(/No instance named "absent"/);
  });

  it('removes a named one and reports what it reclaimed', () => {
    openInstance(dirs, 'memo-work');

    remove(dirs, ['memo-work'], false);

    expect(listInstances(dirs)).toEqual([]);
    expect(printed()).toContain('reclaimed');
  });
});

describe('the listing', () => {
  it('puts the environments first and the instances after', () => {
    openInstance(dirs, 'memo-work');

    list(dirs, { sizes: false, ephemeral: false, resolve, bytes });

    const output = printed();
    expect(output.indexOf('ENVIRONMENT')).toBeLessThan(output.indexOf('INSTANCE'));
    expect(output).toContain('memo-work');
  });

  /**
   * The reason sizes are a flag: `dirBytes` over the real dirs measured 674ms for 1.4GB and 1255ms for
   * 1.5GB, so a default listing would spend about two seconds walking Chromium profiles to answer a
   * question about names and paths. This is the case that keeps that true.
   */
  it('walks nothing unless asked for sizes', () => {
    fs.mkdirSync(resolve('production'), { recursive: true });
    openInstance(dirs, 'memo-work');

    list(dirs, { sizes: false, ephemeral: false, resolve, bytes });
    expect(bytes, 'the default listing measured something').not.toHaveBeenCalled();
    expect(printed()).not.toContain('SIZE');

    list(dirs, { sizes: true, ephemeral: false, resolve, bytes });
    expect(bytes).toHaveBeenCalled();
    expect(printed()).toContain('1.5GB');
  });

  // Ephemeral instances are the run's business, not a reader's: they are noise in a listing whose subject is
  // what persists, and `rm --leaked` is the only thing anyone does to them from outside
  it('leaves the ephemeral ones out until asked', () => {
    const ephemeralDir = path.join(dirs.data, 'instances', '.ephemeral', '4242-throwaway');
    fs.mkdirSync(ephemeralDir, { recursive: true });
    fs.writeFileSync(path.join(ephemeralDir, '.abuddy-instance.json'), JSON.stringify({ created: '', pid: 4242 }));

    list(dirs, { sizes: false, ephemeral: false, resolve, bytes });
    // The full name: the command's own hint says "the throwaway ones", and the first version of this case
    // matched that instead of the instance
    expect(printed()).not.toContain('4242-throwaway');

    vi.mocked(console.log).mockClear();
    list(dirs, { sizes: false, ephemeral: true, resolve, bytes });
    expect(printed()).toContain('4242-throwaway');
  });
});
