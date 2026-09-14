import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearBuildOutput } from '../../src/commands/build';

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
  it("clears a built-in pack's build/, types/ and snapshot, and keeps what other tools write", () => {
    previousBuild(['build/seed-compilers.mjs', 'types/pack-types.d.ts', 'snapshot.json', 'runtime/index.cjs', 'defs/monaco/actions.d.ts']);
    clearBuildOutput(dist, { builtIn: true });
    expect(list(dist)).toEqual(['defs/monaco/actions.d.ts', 'runtime/index.cjs']);
  });

  it("clears an external pack's whole dist/", () => {
    previousBuild(['runtime/index.cjs', 'build/steps.build.mjs', 'types/snapshot.json']);
    clearBuildOutput(dist, { builtIn: false });
    expect(fs.existsSync(dist)).toBe(false);
  });
});
