import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readHostInfo, recordHostInfo } from '../../src/packs/host-info.ts';
import { _appDirOf } from '@abuddy/sdk/env';

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-info-'));
  fs.mkdirSync(_appDirOf(dataDir), { recursive: true });
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('host info record', () => {
  it('reads back the version and pack format the app recorded', () => {
    expect(readHostInfo(dataDir)).toEqual({});
    recordHostInfo(dataDir, { version: '0.3.14', packFormat: 1 });
    expect(readHostInfo(dataDir)).toEqual({ version: '0.3.14', packFormat: 1 });
    recordHostInfo(dataDir, { version: '0.3.14', packFormat: 2 });
    expect(readHostInfo(dataDir)).toEqual({ version: '0.3.14', packFormat: 2 });
    recordHostInfo(dataDir, { version: '0.4.0-beta.1', packFormat: 2 });
    expect(readHostInfo(dataDir)).toEqual({ version: '0.4.0-beta.1', packFormat: 2 });
  });

  // An app that recorded only its version: its format is unknown, which the installer treats as unchecked
  it('reads a record without a pack format as the version alone', () => {
    fs.writeFileSync(path.join(_appDirOf(dataDir), 'host.json'), JSON.stringify({ version: '0.3.14' }));
    expect(readHostInfo(dataDir)).toEqual({ version: '0.3.14', packFormat: undefined });
  });
});
