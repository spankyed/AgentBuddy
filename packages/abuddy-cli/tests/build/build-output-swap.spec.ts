import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { build, buildStagingDir } from '../../src/commands/build';
import { PACK_LAYOUT } from '@abuddy/host/packs';

/**
 * **`abuddy build` assembles `dist/` elsewhere and renames it into place**, so a reader finds the previous
 * build whole or this one whole. What that replaced is removing `dist` first, which published ~20s in which
 * every reader of a pack's output — all of which read a missing output as *not built* — had the wrong answer;
 * the fixture-pack race in `1e19b40d9` was exactly that, fixed then by removing one reader.
 *
 * So the cases here are the inverse of the ones they replace: a failed build leaves the **previous build
 * intact** rather than leaving nothing. What is not asked here is that the swap replaces the tree whole — that
 * is `replaceDir`'s, in `@abuddy/host`'s `tests/replace-dir.spec.ts`, and asking it again would cost a
 * successful build of a fixture pack to re-establish what one rename already guarantees.
 */
let dist: string;
afterEach(() => fs.rmSync(path.dirname(dist), { recursive: true, force: true }));

function previousBuild(files: string[]): string {
  dist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-clear-output-')), 'dist');
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

  it('leaves the whole of the previous build in place, and no staging tree', async () => {
    const dir = previousBuild(PREVIOUS);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: {
      id: 'built-in-pack', name: 'Built-in', builtIn: true,
      features: [{ id: 'memos', settings: 'src/memos/settings.ts' }],
      content: { sources: { flows: 'src/content/flows' } },
    } });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      // The feature's settings file is missing, which fails the build before it compiles the seeds
      await expect(build(['--skip-generate'])).rejects.toThrow('Invalid feature settings');
    } finally {
      process.chdir(cwd);
    }
    expect(list(dir)).toEqual([...PREVIOUS].sort());
    expect(fs.existsSync(buildStagingDir(root)), 'the staged tree goes with the failure').toBe(false);
  });
});

describe('a pack whose seed compiler modules fail to bundle', () => {
  it('fails the build before it writes the snapshot', async () => {
    const dir = previousBuild(['snapshot.json']);
    const root = path.dirname(dir);
    packFixture({
      at: root,
      files: { 'src/tags.ts': 'export default () => [;\n' },
      manifest: {
        id: 'built-in-pack', name: 'Built-in', builtIn: true,
        // Not used by an entry here, so only the bundle for dependents compiles it
        content: { sources: { flows: 'src/content/flows' }, formats: { tags: { compiler: 'src/tags.ts', entity: 'Relation' } } },
      },
    });
    const cwd = process.cwd();
    const exitCode = process.exitCode;
    process.chdir(root);
    try {
      await expect(build(['--skip-generate'])).rejects.toThrow(/Seed compiler bundle failed/);
    } finally {
      process.chdir(cwd);
      process.exitCode = exitCode;
    }
    expect(list(dir), 'the previous build is what a reader still finds').toEqual(['snapshot.json']);
  });
});

describe('a pack whose runtime fails to bundle', () => {
  it('reports it and fails the build without writing the snapshot', async () => {
    dist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-clear-output-')), 'dist');
    const root = path.dirname(dist);
    packFixture({
      at: root,
      // The generated backend entry the runtime bundles doesn't parse
      files: { 'src/__generated__/pack-entry.ts': 'export default {;\n' },
      manifest: { id: 'broken-runtime', name: 'Broken' },
    });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(build(['--skip-generate', '--skip-fe'])).rejects.toThrow(/Build failed, so no snapshot was written:\n[\s\S]*Runtime bundle failed/);
    } finally {
      process.chdir(cwd);
    }
    expect(list(dist)).not.toContain(PACK_LAYOUT.snapshot);
    expect(fs.existsSync(buildStagingDir(root))).toBe(false);
  });
});
