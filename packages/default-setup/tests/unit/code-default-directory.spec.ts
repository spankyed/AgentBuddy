// The code plugin's `defaultBaseDirectory` is where the explorer opens. Changing it moves the explorer there at once;
// any other change to the code settings, `baseDirectory` included (which the explorer writes itself as the user
// browses), leaves the explorer where the user took it.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startApp } from '@abuddy/testing/harness';

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-default-dir-'));
  dirs.push(dir);
  return dir;
};
let app: Awaited<ReturnType<typeof startApp>> | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const setCodeSetting = (key: string, value: unknown) =>
  app!.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'default-setup/code', path: [key], value });
const explorerDirectory = () => (app!.system('code').getSnapshot().context as { baseDirectory: string | null }).baseDirectory;

describe("the code explorer's directory", () => {
  it('moves when defaultBaseDirectory changes', async () => {
    app = await startApp({ systems: ['settings', 'code'] });
    await app.connect();
    const defaultDir = tempDir();

    await setCodeSetting('defaultBaseDirectory', defaultDir);
    await app.settle();

    expect(explorerDirectory()).toBe(defaultDir);
  });

  it('stays where the user browsed when baseDirectory or another setting changes', async () => {
    app = await startApp({ systems: ['settings', 'code'] });
    await app.connect();
    const [defaultDir, browsed, elsewhere] = [tempDir(), tempDir(), tempDir()];
    await setCodeSetting('defaultBaseDirectory', defaultDir);
    await app.settle();

    // Browsing writes baseDirectory, so the code system hears its settings changed, with the same default
    await app.send('code', { type: 'SET_BASE_DIRECTORY', path: browsed });
    await app.settle();
    expect(explorerDirectory()).toBe(browsed);

    await setCodeSetting('baseDirectory', elsewhere);
    await setCodeSetting('autoFetchRemote', true);
    await app.settle();

    expect(explorerDirectory()).toBe(browsed);
  });
});
