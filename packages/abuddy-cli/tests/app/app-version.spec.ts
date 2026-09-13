import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appVersion } from '../../../abuddy-testing/src/app-version.js';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-version-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writeVersion(file: string, version: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version }));
}

describe('appVersion (the @abuddy/testing fixture checks packs against it)', () => {
  it("reads a checkout's package.json", () => {
    writeVersion(path.join(tmp, 'package.json'), '0.3.14');
    expect(appVersion({ kind: 'source', root: tmp })).toBe('0.3.14');
  });

  it('reads the app package inside a packaged macOS build', () => {
    writeVersion(path.join(tmp, 'AgentBuddy Beta.app', 'Contents', 'Resources', 'app', 'package.json'), '0.4.0-beta.2');
    const executable = path.join(tmp, 'AgentBuddy Beta.app', 'Contents', 'MacOS', 'AgentBuddy Beta');
    expect(appVersion({ kind: 'packaged', executable })).toBe('0.4.0-beta.2');
  });

  it('reads resources/app next to a Windows or Linux executable', () => {
    writeVersion(path.join(tmp, 'resources', 'app', 'package.json'), '0.4.0');
    expect(appVersion({ kind: 'packaged', executable: path.join(tmp, 'AgentBuddy.exe') })).toBe('0.4.0');
  });

  it("is undefined when the version can't be found", () => {
    expect(appVersion({ kind: 'packaged', executable: path.join(tmp, 'AgentBuddy') })).toBeUndefined();
  });
});
