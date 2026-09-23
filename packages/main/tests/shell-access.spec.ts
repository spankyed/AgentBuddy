// A window renders what the user wrote, what a model answered and what a pack's frontend built, so what it asks this
// process to open is untrusted whoever asked. These are the two rules that decide, and the app's own links pass them.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shell, resetElectronStub } from './electron-stub.ts';
import { externalUrlProblem, openablePathProblem, openExternalUrl, openFilePath } from '../src/modules/shell-access.ts';

let dir: string;
beforeEach(() => {
  resetElectronStub();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-access-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a link the user follows', () => {
  // http stays beside https: the terminal links what a dev server prints, and that is the address it prints
  it.each([
    'https://console.anthropic.com/settings/keys',
    'http://localhost:5173/',
    'https://discord.gg/JvbHRXcYp6',
  ])('opens %s in the browser', async (url) => {
    expect(externalUrlProblem(url)).toBeUndefined();

    await openExternalUrl(url);

    expect(shell.opened).toEqual([url]);
  });

  it.each([
    ['another scheme, which reaches another program', 'mailto:someone@example.com'],
    ['a file, which the browser is not for', 'file:///etc/passwd'],
    ['a custom scheme a handler would take', 'abuddy://install?pack=x'],
    ['credentials, which hide the host it opens', 'https://apple.com@evil.example/keys'],
    ['what is not a URL at all', 'javascript:alert(1)//'],
  ])('refuses %s', async (_, url) => {
    expect(externalUrlProblem(url)).toBeDefined();

    await openExternalUrl(url);

    expect(shell.opened).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Refused to open'));
  });

  it("says what it refused without the query, which may carry a token", async () => {
    await openExternalUrl('mailto:someone@example.com?subject=secret');

    expect(console.warn).toHaveBeenCalledWith(expect.not.stringContaining('secret'));
  });
});

describe('a file opened with its default application', () => {
  it('opens a file that is there', async () => {
    const file = path.join(dir, 'notes.md');
    fs.writeFileSync(file, '# hi');

    expect(await openablePathProblem(file)).toBeUndefined();
    await openFilePath(file);

    expect(shell.opened).toEqual([file]);
  });

  // The OS runs these rather than opening them, so a window asking for one is refused whatever it says it is
  it.each(['app.command', 'installer.msi', 'macro.vbs', 'Thing.app'])('refuses %s, which the system would run', async (name) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, 'x');

    expect(await openablePathProblem(file)).toBe('the system would run it rather than open it');
    await openFilePath(file);

    expect(shell.opened).toEqual([]);
  });

  it('refuses a path with no file behind it', async () => {
    await openFilePath(path.join(dir, 'gone.md'));

    expect(shell.opened).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('there is no such file'));
  });
});
