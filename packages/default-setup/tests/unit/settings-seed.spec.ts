// The settings seed (abuddy.json `settings`): its format compiles the default settings with each feature's merged
// over them into one record, and its seeder resets the user's settings when the seed is imported.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedCompileContext } from '@abuddy/sdk/build';
import { seedData } from '@abuddy/sdk/utils';
import compileSettings from '../../src/seeds/_compilers/settings';
import { repository } from '@/__generated__/repository';

const PACK_DIR = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(PACK_DIR, 'dist');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A pack dir with a default settings file and two features' settings */
function packWithSettings(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-compiler-'));
  dirs.push(dir);
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  write('abuddy.json', JSON.stringify({ features: [{ id: 'memos', settings: 'memos-settings.mjs' }, { id: 'tags' }, { id: 'gone', settings: 'missing.mjs' }] }));
  write('defaults.mjs', `export default { general: { theme: 'dark', hotkeys: { save: 's' } }, plugins: { _meta: { visibility: {} } } };`);
  write('memos-settings.mjs', `export default { general: { hotkeys: { open: 'o' } }, plugins: { _meta: { visibility: { memos: true } }, memos: { sort: 'newest' } } };`);
  return dir;
}

describe('settings compiler', () => {
  it("merges each feature's settings over the defaults into one record", async () => {
    const dir = packWithSettings();
    const records = await compileSettings({ key: 'settings', path: path.join(dir, 'defaults.mjs'), packDir: dir, format: {} } as unknown as SeedCompileContext);

    expect(records).toEqual([{
      name: 'default-settings',
      description: 'Application defaults',
      settings: {
        general: { theme: 'dark', hotkeys: { save: 's', open: 'o' } },
        plugins: { _meta: { visibility: { memos: true } }, memos: { sort: 'newest' } },
      },
    }]);
  });

  it("compiles default-setup's settings with every feature's (npm run compile)", () => {
    const { records } = JSON.parse(fs.readFileSync(path.join(DIST, 'settings.seed.json'), 'utf-8'));
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0].settings.plugins)).toEqual(expect.arrayContaining(['_meta', 'code', 'flows', 'threads']));
    expect(records[0].settings).not.toHaveProperty('internal');
  });
});

describe('settings seeder', () => {
  const changeASetting = () => repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest');
  const changed = () => repository.settingsQueries.getPluginSettings('threads')?.sort === 'oldest';

  it("resets the user's settings when the seed is imported, and keeps them when existing data is kept", () => {
    changeASetting();
    expect(seedData({ compiledDir: DIST, include: { settings: true }, mode: 'keep-existing' }).settings).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(changed()).toBe(true);

    const only = { actions: new Set<string>(), prompts: new Set<string>(), flows: new Set<string>(), library: new Set<string>(), notes: new Set<string>() };
    expect(seedData({ compiledDir: DIST, include: only, mode: 'replace-on-collision' }).settings).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(changed()).toBe(false);
  });
});
