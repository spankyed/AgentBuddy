// abuddy.json is a feature's only config: `abuddy add feature` writes its designation there, and `abuddy validate`
// checks features[] against the pack on disk
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/commands/init';
import { addFeature } from '../../src/commands/add/feature';
import { validate } from '../../src/commands/validate';

let tmp: string;
let pack: string;
const origCwd = process.cwd();

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-add-feature-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.chdir(tmp);
  try {
    await init(['demo-pack']);
  } finally {
    process.chdir(origCwd);
  }
  pack = path.join(tmp, 'demo-pack');
}, 60_000);

afterEach(() => {
  process.chdir(origCwd);
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const readManifest = () => JSON.parse(fs.readFileSync(path.join(pack, 'abuddy.json'), 'utf-8'));

async function runValidate(): Promise<{ exitCode: number | undefined; output: string }> {
  const log = vi.mocked(console.log);
  log.mockClear();
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw Object.assign(new Error('exit'), { exitCode: code });
  }) as never);
  process.chdir(pack);
  let exitCode: number | undefined;
  try {
    await validate([]);
  } catch (err: any) {
    if (err.exitCode === undefined) throw err;
    exitCode = err.exitCode;
  } finally {
    process.chdir(origCwd);
    exit.mockRestore();
  }
  return { exitCode, output: log.mock.calls.map(args => args.join(' ')).join('\n') };
}

describe('abuddy add feature', () => {
  // Pack code names features and the host addresses them, so what the scaffold writes never holds an address
  it('writes a feature whose code names it and never holds its address', async () => {
    await addFeature(['notes'], pack);
    const feature = path.join(pack, 'src', 'features', 'notes');
    const sources = ['fe/state.ts', 'fe/plugin.ts', 'be/system.ts'].map((file) => fs.readFileSync(path.join(feature, file), 'utf-8')).join('\n');
    expect(sources).not.toMatch(/busId|system-ids|demo-pack\./);
    expect(fs.readFileSync(path.join(feature, 'fe', 'state.ts'), 'utf-8')).toContain("export const id = 'notes';");
    expect(fs.readFileSync(path.join(feature, 'fe', 'plugin.ts'), 'utf-8')).toMatch(/: PluginDefinition = \{\n  label:/);
  });

  // Its system's events are read through the pack's @abuddy/sdk, which a pack just scaffolded may not have yet
  it("keeps the scaffold of a pack whose dependencies aren't installed, and says npm install regenerates", async () => {
    await addFeature(['notes'], pack);

    expect(fs.existsSync(path.join(pack, 'src', 'features', 'notes', 'be', 'system.ts'))).toBe(true);
    const output = vi.mocked(console.log).mock.calls.map((args) => args.join(' ')).join('\n');
    expect(output).toMatch(/src\/__generated__\/ not regenerated: .*that the pack's dependencies are installed\. Run: npm install/);
    expect(output).not.toContain('__generated__/ regenerated');
  });

  it('writes --designation into abuddy.json and no feature.config.ts', async () => {
    await addFeature(['notes', '--designation', 'notes'], pack);

    expect(readManifest().features).toEqual([expect.objectContaining({ id: 'notes', designation: 'notes' })]);
    expect(fs.existsSync(path.join(pack, 'src', 'features', 'notes', 'feature.config.ts'))).toBe(false);
    expect((await runValidate()).exitCode).toBeUndefined();
  }, 60_000);

  // A designation is a role, not a name. The CLI refused one that differed from the feature name, which
  // `validate` has always accepted and the manifest schema has always allowed.
  it('writes a designation that differs from the feature name', async () => {
    await addFeature(['notes', '--designation', 'inbox'], pack);

    expect(readManifest().features).toEqual([expect.objectContaining({ id: 'notes', designation: 'inbox' })]);
    expect((await runValidate()).exitCode).toBeUndefined();
  }, 60_000);
});

describe('abuddy validate', () => {
  it("reports a feature's missing settings file, and accepts a designation that is not its id", async () => {
    await addFeature(['notes'], pack);
    const manifest = readManifest();
    manifest.features[0].designation = 'memos';
    fs.writeFileSync(path.join(pack, 'abuddy.json'), JSON.stringify(manifest, null, 2));
    fs.rmSync(path.join(pack, 'src', 'features', 'notes', 'settings.ts'));

    const { exitCode, output } = await runValidate();

    expect(exitCode).toBe(1);
    expect(output).toContain('Feature "notes": settings file "src/features/notes/settings.ts" not found');
    expect(output).not.toContain('designation');
  }, 60_000);

  describe('seed entries (the checks code generation makes)', () => {
    const DEFAULT_SETUP = path.resolve(import.meta.dirname, '../../../default-setup');
    function editManifest(edit: (manifest: any) => void) {
      const manifest = readManifest();
      edit(manifest);
      fs.writeFileSync(path.join(pack, 'abuddy.json'), JSON.stringify(manifest, null, 2));
    }

    it('reports a format entity no pack declares', async () => {
      editManifest((manifest) => {
        manifest.seedFormats = { ...manifest.seedFormats, memos: { format: 'markdown-tree', entity: 'Memo', identity: ['title'] } };
      });

      const { exitCode, output } = await runValidate();

      expect(exitCode).toBe(1);
      expect(output).toContain(`Seed format "memos": entity "Memo" isn't declared by this pack, its dependencies or the SDK`);
    }, 60_000);

    it("reports a format a dependency doesn't have", async () => {
      editManifest((manifest) => {
        manifest.dependencies = { 'default-setup': `file:${DEFAULT_SETUP}` };
        manifest.boot = { ...manifest.boot, seed: { ...manifest.boot?.seed, memos: { path: 'src/seeds/memos', format: 'default-setup:nope' } } };
      });

      const { exitCode, output } = await runValidate();

      expect(exitCode).toBe(1);
      expect(output).toContain('Seed "memos": dependency "default-setup" has no format "nope"');
    }, 60_000);

    it('reports a seed hooks module without the named export', async () => {
      fs.mkdirSync(path.join(pack, 'src', 'seeds'), { recursive: true });
      fs.writeFileSync(path.join(pack, 'src', 'seeds', 'hooks.ts'), 'export const otherHooks = {};\n');
      editManifest((manifest) => {
        manifest.entities = { ...manifest.entities, Memo: 'Memo' };
        manifest.seedHooks = { Memo: 'src/seeds/hooks.ts#memoHooks' };
      });

      const { exitCode, output } = await runValidate();

      expect(exitCode).toBe(1);
      expect(output).toContain(`Seed hooks for "Memo": src/seeds/hooks.ts doesn't export "memoHooks"`);
    }, 60_000);

    it('passes a pack whose seed entries check out', async () => {
      expect((await runValidate()).exitCode).toBeUndefined();
    }, 60_000);
  });
});
