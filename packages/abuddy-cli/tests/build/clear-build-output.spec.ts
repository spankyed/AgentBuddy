import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, clearBuildOutput } from '../../src/commands/build';

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
  it("clears a built-in pack's seeds, build/, defs/, types/ and snapshot, and keeps the runtime its own build writes", () => {
    previousBuild([
      'notes.seed.json', 'seeds.json', 'media/library/pic.png', 'build/seed-compilers.mjs', 'types/pack-types.d.ts',
      'snapshot.json', 'runtime/index.cjs', 'runtime/index.cjs.map', 'runtime/seeds-index.sha256', 'defs/monaco/actions.d.ts',
    ]);
    clearBuildOutput(dist, { builtIn: true });
    expect(list(dist)).toEqual(['runtime/index.cjs', 'runtime/index.cjs.map', 'runtime/seeds-index.sha256']);
  });

  it("clears an external pack's whole dist/", () => {
    previousBuild(['runtime/index.cjs', 'build/steps.build.mjs', 'types/snapshot.json']);
    clearBuildOutput(dist, { builtIn: false });
    expect(fs.existsSync(dist)).toBe(false);
  });
});

describe('a built-in pack build that fails', () => {
  it("leaves no seeds or defs from the previous build, and keeps the runtime it doesn't build", async () => {
    const dir = previousBuild(['flows.seed.json', 'seeds.json', 'runtime/index.cjs', 'defs/monaco/actions.d.ts']);
    const root = path.dirname(dir);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'built-in-pack', type: 'module' }));
    fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify({
      id: 'built-in-pack', name: 'Built-in', version: '1.0.0', builtIn: true,
      features: [{ id: 'memos', settings: 'src/memos/settings.ts' }],
      boot: { seed: { flows: 'src/seeds/flows' } },
    }));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      // The feature's settings file is missing, which fails the build before it compiles the seeds
      await expect(build(['--skip-generate'])).rejects.toThrow('Invalid feature settings');
    } finally {
      process.chdir(cwd);
    }
    expect(list(dir)).toEqual(['runtime/index.cjs']);
  });
});
