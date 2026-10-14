import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { build, buildStagingDir } from '../../src/commands/build';
import { PACK_LAYOUT, readPackBuild, stagePack, verifyPack } from '@apackdev/host/packs';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { generateEntries } from '../../src/commands/generate-entries';

/**
 * **`apack pack build` assembles `dist/` elsewhere and renames it into place**, so a reader finds the previous
 * build whole or this one whole. What that replaced is removing `dist` first, which published ~20s in which
 * every reader of a pack's output — all of which read a missing output as *not built* — had the wrong answer;
 * the fixture-pack race in `1e19b40d9` was exactly that, fixed then by removing one reader.
 *
 * So the cases here are the inverse of the ones they replace: a failed build leaves the **previous build
 * intact** rather than leaving nothing. What is not asked here is that the swap replaces the tree whole — that
 * is `replaceDir`'s, in `@apackdev/host`'s `tests/replace-dir.spec.ts`, and asking it again would cost a
 * successful build of a fixture pack to re-establish what one rename already guarantees.
 */
let dist: string;
afterEach(() => fs.rmSync(path.dirname(dist), { recursive: true, force: true }));

function previousBuild(files: string[]): string {
  dist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-clear-output-')), 'dist');
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    fs.writeFileSync(path.join(dist, file), '');
  }
  return dist;
}

const list = (dir: string): string[] => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort()
  : [];

describe('a build that fails', () => {
  const PREVIOUS = ['flows.content.json', 'content.json', 'runtime/index.cjs', 'defs/monaco/actions.d.ts'];

  it('refuses publication when an authored input changes during a real build', async () => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: { id: 'changing-inputs', name: 'Changing', features: {}, content: { formats: { tags: { compiler: 'src/compiler.ts', entity: 'Relation' } }, sources: { tags: { path: 'src/data.ts', format: 'tags' } } } }, files: {
      'src/compiler.ts': "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('../changed.json', import.meta.url), '{}'); export default function compile() { return []; }",
      'src/data.ts': 'export default [];',
    } });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(build(['--skip-fe'])).rejects.toThrow('Pack inputs changed during the build');
    } finally { process.chdir(cwd); }
    expect(fs.existsSync(path.join(root, 'changed.json'))).toBe(true);
    expect(list(dir)).toEqual([...PREVIOUS].sort());
    expect(fs.existsSync(buildStagingDir(root))).toBe(false);
  });

  it('refuses stale generated declarations and retains the previous artifact', async () => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: { id: 'stale-codegen', name: 'Before', features: {} } });
    const manifestFile = path.join(root, 'apack.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    await generateEntries([], root);
    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, name: 'After' }));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(build(['--skip-generate', '--skip-fe'])).rejects.toThrow('Generated pack files are stale: inputs changed');
    } finally { process.chdir(cwd); }
    expect(list(dir)).toEqual([...PREVIOUS].sort());
    expect(fs.existsSync(buildStagingDir(root))).toBe(false);
  });

  it.each(['missing', 'modified'])('refuses %s generated code before replacing the previous artifact', async (change) => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: { id: 'damaged-codegen', name: 'Test', features: {},
      content: { formats: { tags: { compiler: 'src/compiler.ts', entity: 'Relation' } }, sources: { tags: { path: 'src/data.ts', format: 'tags' } } },
    }, files: {
      'src/compiler.ts': "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('../compiler-executed', import.meta.url), 'yes'); export default function compile() { return []; }",
      'src/data.ts': 'export default [];',
    } });
    await generateEntries([], root);
    const entry = path.join(root, 'src/__generated__/pack-entry.ts');
    if (change === 'missing') fs.rmSync(entry);
    else fs.appendFileSync(entry, '\nthrow new Error("edited entry executed");\n');
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(build(['--skip-generate', '--skip-fe'])).rejects.toThrow(`${change} src/__generated__/pack-entry.ts`);
    } finally { process.chdir(cwd); }
    expect(fs.existsSync(path.join(root, 'compiler-executed'))).toBe(false);
    expect(list(dir)).toEqual([...PREVIOUS].sort());
    expect(fs.existsSync(buildStagingDir(root))).toBe(false);
  });

  it('publishes help as snapshot data and retains accepted articles after an invalid edit', async () => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: {
      features: {}, extensions: { help: { path: 'docs/help' } },
    }, files: { 'docs/help/start.md': '# Start\nFirst article' } });
    const file = path.join(root, 'docs/help/start.md');
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await build([]);
      expect(readPackBuild(dir).snapshot.help).toEqual([{ id: 'start', title: 'Start', body: 'First article' }]);
      fs.writeFileSync(file, '# Updated\nChanged article');
      await build([]);
      expect(readPackBuild(dir).snapshot.help![0]).toMatchObject({ title: 'Updated', body: expect.stringContaining('Changed article') });
      const accepted = fs.readFileSync(path.join(dir, PACK_LAYOUT.snapshot), 'utf8');
      fs.writeFileSync(file, 'Missing title');
      await expect(build([])).rejects.toThrow('first H1');
      expect(fs.readFileSync(path.join(dir, PACK_LAYOUT.snapshot), 'utf8')).toBe(accepted);
      expect(readPackBuild(dir).snapshot.help![0].title).toBe('Updated');
    } finally { process.chdir(cwd); }
  });

  it('leaves the whole of the previous build in place, and no staging tree', async () => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: {
      id: 'built-in-pack', name: 'Built-in',
      features: { memos: { description: 'Feature declaration fixture.', settings: { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }, defaults: {} } } },
      content: { sources: { flows: 'src/content/flows' } },
    } });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      // Invalid declared defaults fail before content compilation.
      await expect(build(['--skip-generate'])).rejects.toThrow('features.memos.settings.defaults.name');
    } finally {
      process.chdir(cwd);
    }
    expect(list(dir)).toEqual([...PREVIOUS].sort());
    expect(fs.existsSync(buildStagingDir(root)), 'the staged tree goes with the failure').toBe(false);
  });
});

describe('a pack whose content compiler modules fail to bundle', () => {
  it('fails the build before it writes the snapshot', async () => {
    const dir = previousBuild(['snapshot.json']);
    const root = path.dirname(dir);
    packFixture({
      at: root,
      files: { 'src/tags.ts': 'import "./missing-compiler.ts"; export default () => [];\n' },
      manifest: {
        id: 'built-in-pack', name: 'Built-in', features: {},
        // Not used by an entry here, so only the bundle for dependents compiles it
        content: { sources: { flows: 'src/content/flows' }, formats: { tags: { compiler: 'src/tags.ts', entity: 'Relation' } } },
      },
    });
    const cwd = process.cwd();
    const exitCode = process.exitCode;
    process.chdir(root);
    try {
      await expect(build([])).rejects.toThrow(/Content compiler bundle failed/);
    } finally {
      process.chdir(cwd);
      process.exitCode = exitCode;
    }
    expect(list(dir), 'the previous build is what a reader still finds').toEqual(['snapshot.json']);
  });
});

describe('a pack whose runtime fails to bundle', () => {
  it('reports it and fails the build without writing the snapshot', async () => {
    dist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-clear-output-')), 'dist');
    const root = path.dirname(dist);
    packFixture({
      at: root,
      files: { 'src/lifecycle.ts': 'import "./missing-runtime.ts"; export function apply() {}' },
      manifest: { id: 'broken-runtime', name: 'Broken', features: {}, lifecycle: { onInit: 'src/lifecycle.ts#apply' } },
    });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(build(['--skip-fe'])).rejects.toThrow(/Build failed, so no snapshot was written:\n[\s\S]*Runtime bundle failed/);
    } finally {
      process.chdir(cwd);
    }
    expect(list(dist)).not.toContain(PACK_LAYOUT.snapshot);
    expect(fs.existsSync(buildStagingDir(root))).toBe(false);
  });
});


describe('a completed build', () => {
  it('publishes verified output and rebuilds damaged reusable files instead of renewing their checksums', async () => {
    const dir = previousBuild([]);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: { id: 'sealed-build', name: 'Sealed', features: {} }, nodeModules: path.join(REPO_ROOT, 'node_modules') });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await build(['--skip-fe']);
      const first = readPackBuild(dir);
      expect(first.integrity.files[PACK_LAYOUT.runtimeEntry]).toMatch(/^[a-f0-9]{64}$/);
      const reusable = path.join(dir, 'types/pack-types.d.ts');
      const original = fs.readFileSync(reusable, 'utf8');
      fs.appendFileSync(reusable, '\nexport type Damaged = never;');
      expect(() => verifyPack(dir)).toThrow('checksum mismatch types/pack-types.d.ts');
      await build(['--skip-fe']);
      expect(fs.readFileSync(reusable, 'utf8')).toBe(original);
      expect(readPackBuild(dir).revision).toBe(first.revision);
      const stage = path.join(root, 'stage');
      stagePack(root, stage);
      expect(verifyPack(stage).id).toBe('sealed-build');
    } finally { process.chdir(cwd); }
  });
});
