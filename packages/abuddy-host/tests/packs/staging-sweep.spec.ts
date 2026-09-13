import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sweepStaleStagingDirs } from '../../src/packs/pack-installer.ts';

let packsDir: string;
beforeEach(() => { packsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-sweep-')); });
afterEach(() => fs.rmSync(packsDir, { recursive: true, force: true }));

const mkdir = (name: string) => fs.mkdirSync(path.join(packsDir, name));
const remaining = () => fs.readdirSync(packsDir).sort();

describe('sweepStaleStagingDirs', () => {
  it("removes staging dirs whose process is gone and keeps another process's install in progress", () => {
    const exited = spawnSync(process.execPath, ['-e', '']).pid!;
    const running = process.ppid;
    mkdir('demo-pack');
    mkdir(`.demo-pack.installing-${exited}-a1B2c3`);
    mkdir(`.demo-pack.previous-${exited}`);
    mkdir(`.base-pack.publishing-${exited}`);
    mkdir(`.other-pack.installing-${running}-d4E5f6`);
    mkdir(`.other-pack.previous-${process.pid}`);

    expect(sweepStaleStagingDirs(packsDir).sort()).toEqual([
      `.base-pack.publishing-${exited}`,
      `.demo-pack.installing-${exited}-a1B2c3`,
      `.demo-pack.previous-${exited}`,
    ]);
    expect(remaining()).toEqual([`.other-pack.installing-${running}-d4E5f6`, `.other-pack.previous-${process.pid}`, 'demo-pack'].sort());
  });

  it('removes staging dirs without a PID only once they are old', () => {
    mkdir('.old-pack.installing-Xy12Zw');
    mkdir('.new-pack.installing-Ab34Cd');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(path.join(packsDir, '.old-pack.installing-Xy12Zw'), twoHoursAgo, twoHoursAgo);

    expect(sweepStaleStagingDirs(packsDir)).toEqual(['.old-pack.installing-Xy12Zw']);
    expect(remaining()).toEqual(['.new-pack.installing-Ab34Cd']);
  });

  it('ignores a packs dir that does not exist yet', () => {
    expect(sweepStaleStagingDirs(path.join(packsDir, 'missing'))).toEqual([]);
  });
});
