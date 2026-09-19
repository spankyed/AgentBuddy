import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { featureSettingsProblems } from '../../src/commands/build';

/** abuddy build fails on feature settings the app would refuse when the pack loads */
let root: string;
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function pack(files: Record<string, string>): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-feature-settings-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'settings-pack', type: 'module' }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('featureSettingsProblems', () => {
  it("accepts settings that set only the feature's own plugin", async () => {
    const dir = pack({ 'src/memos/settings.ts': "export default { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' as const } } };\n" });
    expect(await featureSettingsProblems(dir, [{ id: 'memos', settings: 'src/memos/settings.ts' }, { id: 'todos' }])).toEqual([]);
  });

  it("reports settings for another plugin, and a missing settings file", async () => {
    const dir = pack({ 'src/memos/settings.ts': 'export default { plugins: { memos: {}, threads: { hidden: true } } };\n' });
    expect(await featureSettingsProblems(dir, [
      { id: 'memos', settings: 'src/memos/settings.ts' },
      { id: 'todos', settings: 'src/todos/settings.ts' },
    ])).toEqual([
      expect.stringContaining('Feature "memos" settings set "plugins.threads"'),
      'Feature "todos" settings: src/todos/settings.ts doesn\'t exist',
    ]);
  });
});
