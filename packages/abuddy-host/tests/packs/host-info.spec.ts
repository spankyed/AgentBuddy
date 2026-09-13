import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readHostVersion, recordHostVersion } from '../../src/packs/host-info.js';

let dataDir: string;
beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-info-')); });
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('host version record', () => {
  it('reads back the version the app recorded', () => {
    expect(readHostVersion(dataDir)).toBeUndefined();
    recordHostVersion(dataDir, '0.3.14');
    expect(readHostVersion(dataDir)).toBe('0.3.14');
    recordHostVersion(dataDir, '0.4.0-beta.1');
    expect(readHostVersion(dataDir)).toBe('0.4.0-beta.1');
  });
});
