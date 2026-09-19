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
  it('writes --designation into abuddy.json and no feature.config.ts', async () => {
    await addFeature(['notes', '--designation', 'notes'], pack);

    expect(readManifest().features).toEqual([expect.objectContaining({ id: 'notes', designation: 'notes' })]);
    expect(fs.existsSync(path.join(pack, 'src', 'features', 'notes', 'feature.config.ts'))).toBe(false);
    expect((await runValidate()).exitCode).toBeUndefined();
  }, 60_000);

  it('rejects a designation that is not the feature name, writing nothing', async () => {
    await expect(addFeature(['notes', '--designation', 'memos'], pack)).rejects.toThrow(/must equal the feature name/);
    expect(readManifest().features ?? []).toEqual([]);
  });
});

describe('abuddy validate', () => {
  it("reports a feature's missing settings file and a designation that is not its id", async () => {
    await addFeature(['notes'], pack);
    const manifest = readManifest();
    manifest.features[0].designation = 'memos';
    fs.writeFileSync(path.join(pack, 'abuddy.json'), JSON.stringify(manifest, null, 2));
    fs.rmSync(path.join(pack, 'src', 'features', 'notes', 'settings.ts'));

    const { exitCode, output } = await runValidate();

    expect(exitCode).toBe(1);
    expect(output).toContain('Feature "notes": settings file "src/features/notes/settings.ts" not found');
    expect(output).toContain('Feature "notes": designation "memos" must equal the feature id');
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
