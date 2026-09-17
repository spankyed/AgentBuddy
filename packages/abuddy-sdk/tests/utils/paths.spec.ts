// Where the app keeps its stores in a data dir. The app picks the layout from NODE_ENV; `abuddy db` finds it on disk
// (findAppDataPaths in @abuddy/host), so these two have to agree about what a packaged run and a source run look like.
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDataPaths, getDataDirPath, getLmdbPath, getMediaPath, getSecretsFilePath, getVolatileLmdbPath, resolvePath } from '../../src/utils/paths.ts';

const saved = { nodeEnv: process.env.NODE_ENV, abuddyEnv: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
const dataDir = path.join(path.sep, 'tmp', 'a-data-dir');

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

describe('appDataPaths', () => {
  it('puts a packaged app\'s stores at the root of the data dir and a source run\'s under .data', () => {
    expect(appDataPaths(dataDir, { packaged: true })).toEqual({
      lmdb: path.join(dataDir, 'ears-db'),
      volatileLmdb: path.join(dataDir, 'ears-trace'),
      secretsFile: path.join(dataDir, 'secrets.json'),
      media: path.join(dataDir, 'media'),
    });
    expect(appDataPaths(dataDir, { packaged: false })).toEqual({
      lmdb: path.join(dataDir, '.data', 'ears-db'),
      volatileLmdb: path.join(dataDir, '.data', 'ears-trace'),
      secretsFile: path.join(dataDir, '.data', 'secrets.json'),
      media: path.join(dataDir, '.data', 'media'),
    });
  });
});

describe('resolvePath', () => {
  it('takes the packaged layout for NODE_ENV=production and the source layout otherwise', () => {
    process.env.NODE_ENV = 'production';
    expect(resolvePath('lmdb')).toBe(path.join(dataDir, 'ears-db'));

    for (const value of ['development', 'test', undefined]) {
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      expect(resolvePath('lmdb'), `NODE_ENV=${value}`).toBe(path.join(dataDir, '.data', 'ears-db'));
    }
  });

  it('gives every store the layout appDataPaths does, so the app and abuddy db agree', () => {
    for (const nodeEnv of ['production', 'development']) {
      process.env.NODE_ENV = nodeEnv;
      const expected = appDataPaths(dataDir, { packaged: nodeEnv === 'production' });
      expect({
        lmdb: getLmdbPath(),
        volatileLmdb: getVolatileLmdbPath(),
        secretsFile: getSecretsFilePath(),
        media: getMediaPath(),
      }, nodeEnv).toEqual(expected);
    }
  });
});

describe('getDataDirPath', () => {
  it('follows the same layout switch, for a folder beside the stores', () => {
    process.env.NODE_ENV = 'production';
    expect(getDataDirPath('backups')).toBe(path.join(dataDir, 'backups'));
    process.env.NODE_ENV = 'development';
    expect(getDataDirPath('backups')).toBe(path.join(dataDir, '.data', 'backups'));
  });
});
