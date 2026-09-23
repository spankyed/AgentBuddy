// The settings seed (abuddy.json `settings`): its format compiles the app's default settings into one record, and
// its seeder resets the user's settings when the seed is imported. Features' settings come from the pack registry,
// under each plugin's address, so the seed holds none: a copy under the bare feature id would be a default only a
// stale reader finds.
import { services } from '@/__generated__/services';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedCompileContext } from '@abuddy/sdk/build';
import { seedData } from '@abuddy/sdk/utils';
import compileSettings from '../../src/seeds/_compilers/settings';
import { repository } from '@/__generated__/repository';
import { ref } from '@/__generated__/ref';

const PACK_DIR = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(PACK_DIR, 'dist');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A pack dir with a default settings file */
function packWithDefaults(defaults: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-compiler-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'defaults.mjs'), defaults);
  return dir;
}
const compile = (dir: string) =>
  compileSettings({ key: 'settings', path: path.join(dir, 'defaults.mjs'), packDir: dir, format: {} } as unknown as SeedCompileContext);

describe('settings compiler', () => {
  it('compiles the default settings into one record', async () => {
    const dir = packWithDefaults(`export default { general: { theme: 'dark' }, plugins: {} };`);
    expect(await compile(dir)).toEqual([{
      name: 'default-settings',
      description: 'Application defaults',
      settings: { general: { theme: 'dark' }, plugins: {} },
    }]);
  });

  // The app shell's old `_meta` too: which tabs show is each feature's `visible`, and the host's state
  it("refuses default settings that set a plugin's slice, or anything else under plugins", async () => {
    await expect(compile(packWithDefaults(`export default { plugins: { _meta: { visibility: {} } } };`))).rejects.toThrow("sets a plugin's settings");
    const dir = packWithDefaults(`export default { plugins: { memos: { sort: 'newest' } } };`);
    await expect(compile(dir)).rejects.toThrow("sets a plugin's settings: a feature declares its own, and whether its tab shows, in features[].settings");
  });

  it("compiles default-setup's settings with no plugin's in them (npm run compile)", () => {
    const { records } = JSON.parse(fs.readFileSync(path.join(DIST, 'settings.seed.json'), 'utf-8'));
    expect(records).toHaveLength(1);
    expect(records[0].settings.plugins).toEqual({});
    expect(records[0].settings).not.toHaveProperty('internal');
  });
});

describe('settings seeder', () => {
  const changeASetting = () => services.settings.setForFeature(ref('threads'), ['sort'], 'oldest');
  const changed = () => services.settings.forFeature<{ sort?: string }>(ref('threads'))?.sort === 'oldest';

  it("resets the user's settings when the seed is imported, and keeps them when existing data is kept", () => {
    changeASetting();
    expect(seedData({ compiledDir: DIST, include: { settings: true }, mode: 'keep-existing' }).settings).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(changed()).toBe(true);

    const only = { actions: new Set<string>(), prompts: new Set<string>(), flows: new Set<string>(), library: new Set<string>(), notes: new Set<string>() };
    expect(seedData({ compiledDir: DIST, include: only, mode: 'replace-on-collision' }).settings).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(changed()).toBe(false);
  });
});
