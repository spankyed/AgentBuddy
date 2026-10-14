// `apack pack validate` checks each apack.json `features` entry against the pack on disk
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateFeatures } from '../../src/build/validate.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-validate-features-'));
  dirs.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'export default {};\n');
  }
  return root;
}

const memos = {
  settings: { schema: { type: 'object' }, defaults: {}, form: 'src/features/memos/fe/settings.vue' },
  system: { entry: 'src/features/memos/be/system.ts' },
  plugin: { label: 'Fixture', state: 'src/features/memos/fe/plugin.ts' },
};
const memosFiles = [memos.settings.form, memos.system.entry, memos.plugin.state];

describe('validateFeatures', () => {
  it('accepts features whose files exist and whose designation is the feature id', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos: { ...memos, designation: 'memos' } } })).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [] });
  });

  it.each([
    ['settings.form', memos.settings.form],
    ['system.entry', memos.system.entry],
    ['plugin.state', memos.plugin.state],
  ])('reports a missing %s file', (field, missing) => {
    const root = pack(memosFiles.filter(file => file !== missing));
    expect(messagesOf(validateFeatures(root, { features: { memos } }))).toEqual([`Feature "memos": ${field} file "${missing}" not found`]);
  });

  // `inbox`, not `memos`: a designation equal to the feature's id is what this case is *not* about, and a
  // rename made it exactly that for a while, leaving the name to claim what the fixture no longer showed
  it('accepts a designation that differs from the feature id: a designation is a role, not a name', () => {
    const root = pack(memosFiles);
    expect(messagesOf(validateFeatures(root, { features: { memos: { ...memos, designation: 'inbox' } } }))).toEqual([]);
  });

  it('reports one role claimed by two features of the same pack', () => {
    const root = pack(memosFiles);
    const errors = messagesOf(validateFeatures(root, {
      features: { memos: { ...memos, designation: 'inbox' }, scraps: { ...memos, designation: 'inbox' } },
    }));
    expect(errors).toEqual(['Feature "scraps": designation "inbox" is already claimed by feature "memos"']);
  });

  it('accepts two features with different designations', () => {
    const root = pack(memosFiles);
    expect(messagesOf(validateFeatures(root, {
      features: { memos: { ...memos, designation: 'memos' }, scraps: { ...memos, designation: 'scraps' } },
    }))).toEqual([]);
  });
});

// A feature's types module reaches the rest of the pack through `#generated/types`. A path that isn't there
// contributes nothing and says nothing, so validate is where a typo in it surfaces.
describe('types', () => {
  it('resolves a declared directory barrel and refuses an escaping module', () => {
    const root = pack(['src/public/index.ts']);
    expect(messagesOf(validateFeatures(root, { features: { memos: { types: 'src/public' } } }))).toEqual([]);
    for (const types of ['../outside.ts', path.join(root, 'src/public/index.ts')]) {
      expect(messagesOf(validateFeatures(root, { features: { memos: { types } } }))[0])
        .toContain('pack-root-relative and stay within the pack');
    }
    const outside = pack(['external.ts']);
    fs.symlinkSync(path.join(outside, 'external.ts'), path.join(root, 'linked.ts'));
    expect(messagesOf(validateFeatures(root, { features: { memos: { types: 'linked.ts' } } }))[0])
      .toContain('type module must stay within the pack');
  });
  it('accepts one whose module exists, written with or without its extension', () => {
    const root = pack([...memosFiles, 'src/features/memos/be/types.ts']);
    for (const types of ['src/features/memos/be/types', 'src/features/memos/be/types.ts']) {
      expect(validateFeatures(root, { features: { memos: { ...memos, types } } })).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [] });
    }
  });

  it('reports one whose module is not there', () => {
    const root = pack(memosFiles);
    expect(messagesOf(validateFeatures(root, { features: { memos: { ...memos, types: 'src/features/memos/be/typos' } } })))
      .toEqual(['Feature "memos": types: no TypeScript module found at src/features/memos/be/typos (.ts or /index.ts)']);
  });

  it('says nothing about a feature that declares none', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos } })).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [] });
  });
});

describe('pack settings forms', () => {
  const form = 'src/extensions/settings/preferences.vue';
  const definition = { schema: { type: 'object' }, defaults: {}, form };

  it('validates a group form without a feature or plugin', () => {
    expect(validateFeatures(pack([form]), {
      extensions: { settings: { preferences: definition } },
    })).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [] });
  });

  it('reports the missing form at its manifest address', () => {
    const result = validateFeatures(pack([]), {
      id: 'example', extensions: { settings: { preferences: definition } },
    });
    expect(result.status).toBe('invalid');
    expect(result.diagnostics).toEqual([{
      code: 'settings.missing-form', severity: 'error', packId: 'example',
      path: ['extensions', 'settings', 'preferences', 'form'], source: form,
      message: `Settings group "preferences": form file "${form}" not found`,
    }]);
  });

  it('accepts a declaration with no custom form', () => {
    expect(validateFeatures(pack([]), {
      extensions: { settings: { preferences: { schema: { type: 'object' }, defaults: {} } } },
    })).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [] });
  });
});

function messagesOf(result: { diagnostics: { message: string }[] }): string[] {
  return result.diagnostics.map(issue => issue.message);
}
