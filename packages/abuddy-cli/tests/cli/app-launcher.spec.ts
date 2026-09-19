import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const LAUNCHER = path.resolve(__dirname, '..', '..', 'bin', 'app-launcher.sh');

let tmp: string | undefined;

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe.skipIf(process.platform === 'win32')('app-bundled abuddy launcher', () => {
  it('runs the bundled CLI through the app executable as Node, via the PATH symlink', () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-launcher-')));
    const contents = path.join(tmp, 'AgentBuddy Beta.app', 'Contents');
    const executable = path.join(contents, 'MacOS', 'AgentBuddy Beta');
    const launcher = path.join(contents, 'Resources', 'cli', 'abuddy');
    const cliBin = path.join(contents, 'Resources', 'app', 'packages', 'abuddy-cli', 'dist', 'package', 'bin', 'abuddy.mjs');

    // Stands in for Electron: reports how it was started
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, '#!/bin/sh\necho "ELECTRON_RUN_AS_NODE=$ELECTRON_RUN_AS_NODE"\nfor a in "$@"; do echo "arg=$a"; done\n');
    fs.chmodSync(executable, 0o755);
    fs.mkdirSync(path.dirname(launcher), { recursive: true });
    fs.copyFileSync(LAUNCHER, launcher);
    fs.chmodSync(launcher, 0o755);
    fs.mkdirSync(path.dirname(cliBin), { recursive: true });
    fs.writeFileSync(cliBin, '');

    const binDir = path.join(tmp, 'usr-local-bin');
    fs.mkdirSync(binDir);
    fs.symlinkSync(launcher, path.join(binDir, 'abuddy'));

    const output = execFileSync(path.join(binDir, 'abuddy'), ['build', '--release'], { env: { PATH: process.env.PATH } }).toString();

    expect(output.trim().split('\n')).toEqual([
      'ELECTRON_RUN_AS_NODE=1',
      `arg=${cliBin}`,
      'arg=build',
      'arg=--release',
    ]);
  });
});
