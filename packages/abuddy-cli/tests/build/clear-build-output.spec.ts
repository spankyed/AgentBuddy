import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { build, clearBuildOutput } from '../../src/commands/build';
import { PACK_LAYOUT } from '@abuddy/host/packs';

/** abuddy build starts from no earlier output of its own, so nothing stale ships or gets published */
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

describe('clearBuildOutput', () => {
  // One pack kind, so one answer: `dist/` is this command's output and goes whole. It used to spare
  // `runtime/` for the pack that ships with the app, whose runtime another command wrote.
  it("clears a pack's whole dist/, runtime and compiled seeds included", () => {
    previousBuild([
      'notes.seed.json', 'seeds.json', 'media/library/pic.png', 'build/seed-compilers.mjs', 'types/pack-types.d.ts',
      PACK_LAYOUT.snapshot, 'runtime/index.cjs', 'runtime/index.cjs.map', 'defs/monaco/actions.d.ts',
    ]);
    clearBuildOutput(dist);
    expect(fs.existsSync(dist)).toBe(false);
  });
});

describe('a build that fails', () => {
  it('leaves nothing of the previous build behind', async () => {
    const dir = previousBuild(['flows.seed.json', 'seeds.json', 'runtime/index.cjs', 'defs/monaco/actions.d.ts']);
    const root = path.dirname(dir);
    packFixture({ at: root, manifest: {
      id: 'built-in-pack', name: 'Built-in', builtIn: true,
      features: [{ id: 'memos', settings: 'src/memos/settings.ts' }],
      boot: { seed: { flows: 'src/seeds/flows' } },
    } });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      // The feature's settings file is missing, which fails the build before it compiles the seeds
      await expect(build(['--skip-generate'])).rejects.toThrow('Invalid feature settings');
    } finally {
      process.chdir(cwd);
    }
    expect(list(dir)).toEqual([]);
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
        seedFormats: { tags: { compiler: 'src/tags.ts', entity: 'Relation' } },
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
    expect(list(dir)).not.toContain('snapshot.json');
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
  });
});
