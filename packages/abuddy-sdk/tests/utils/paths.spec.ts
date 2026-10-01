// Where the app keeps its stores in a data dir: inside `appDir`, the one directory it owns. There is no layout
// switch left to disagree about — the app and `abuddy db` read the same paths from the same function.
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _appDataPaths, _packDataDir, _getLmdbPath, _getMediaPath, _getSecretsFilePath, _getVolatileLmdbPath, _resolvePath } from '../../src/utils/paths.ts';

const saved = { nodeEnv: process.env.NODE_ENV, abuddyEnv: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
const dataDir = path.join(path.sep, 'tmp', 'a-data-dir');
const appDir = path.join(dataDir, 'abuddy');

beforeEach(() => {
  process.env.ABUDDY_ENV = 'development';
  process.env.ABUDDY_USER_DATA_DIR = dataDir;
});

afterEach(() => {
  for (const [key, value] of [['NODE_ENV', saved.nodeEnv], ['ABUDDY_ENV', saved.abuddyEnv], ['ABUDDY_USER_DATA_DIR', saved.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('_appDataPaths', () => {
  it('puts every store inside the directory the app owns, not in the one Chromium shares', () => {
    expect(_appDataPaths(dataDir)).toEqual({
      lmdb: path.join(appDir, 'ears-db'),
      volatileLmdb: path.join(appDir, 'ears-trace'),
      secretsFile: path.join(appDir, 'secrets.json'),
      media: path.join(appDir, 'media'),
    });
  });

  // The layout used to fork on NODE_ENV, which is how one data dir came to hold two databases that no tool
  // could then open. Nothing reads it now, so a value that used to change the answer must not.
  it('gives the same answer whatever NODE_ENV says', () => {
    for (const value of ['production', 'development', 'test', undefined]) {
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      expect(_resolvePath('lmdb'), `NODE_ENV=${value}`).toBe(path.join(appDir, 'ears-db'));
    }
  });

  it('gives every store the layout _appDataPaths does, so the app and abuddy db agree', () => {
    expect({
      lmdb: _getLmdbPath(),
      volatileLmdb: _getVolatileLmdbPath(),
      secretsFile: _getSecretsFilePath(),
      media: _getMediaPath(),
    }).toEqual(_appDataPaths(dataDir));
  });
});

describe('_packDataDir', () => {
  it('gives each pack its own subtree, so two packs asking for one name get different directories', () => {
    expect(_packDataDir('default-setup', 'models-cache')).toBe(path.join(appDir, 'pack-data', 'default-setup', 'models-cache'));
    expect(_packDataDir('other-pack', 'models-cache')).toBe(path.join(appDir, 'pack-data', 'other-pack', 'models-cache'));
  });

  // The name arrives from a pack, and before the namespace it was joined straight onto a directory holding
  // Chromium's files and the app's own stores. These are the shapes that used to resolve somewhere else.
  it('refuses a name that is not one directory', () => {
    for (const name of ['../..', 'a/b', '/etc', '.hidden', '', 'x'.repeat(65), 'trailing ']) {
      expect(() => _packDataDir('default-setup', name), JSON.stringify(name)).toThrow(/isn't a usable data directory name/);
    }
  });

  // Windows' reserved device names and its trailing dot/space rule. Refused on every platform on purpose: a
  // pack that works on macOS and fails at mkdir on Windows is worse than one that is told so. The instance
  // name rule already had these; this one did not, which is why both now go through _pathSegmentProblem.
  it('refuses what the filesystem reserves, on every platform', () => {
    for (const name of ['con', 'CON', 'aux', 'nul', 'com1', 'lpt9', 'trailing.']) {
      expect(() => _packDataDir('default-setup', name), JSON.stringify(name)).toThrow(/reserved by the filesystem/);
    }
  });

  // A pack naming one of these no longer reaches it: the namespace puts a pack a level below every one of them
  it('cannot reach Chromium\'s files or the app\'s own stores', () => {
    for (const name of ['Cache', 'Preferences', 'packs', 'ears-db', 'secrets.json']) {
      expect(_packDataDir('default-setup', name)).toBe(path.join(appDir, 'pack-data', 'default-setup', name));
    }
  });
});
