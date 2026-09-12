import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractBundleArchive, verifyBundle } from '@abuddy/sdk/packs';

/**
 * The scaffold an outside author starts from must build, typecheck and pack as
 * generated. Runs the real CLI in a temp dir outside the monorepo; only the
 * toolchain's node_modules are borrowed from the repo (no Electron).
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

let tmp: string;
let pack: string;

function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  try {
    const output = execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } }).toString();
    return { code: 0, output };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-scaffold-'));
  expect(run('node', [CLI, 'init', 'demo-pack'], tmp).code).toBe(0);
  pack = path.join(tmp, 'demo-pack');
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(pack, 'node_modules'), 'dir');
}, 60_000);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('abuddy init → add feature → build → tsc → pack', () => {
  it('scaffolds a pack with a release workflow and no unresolvable dependencies', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'abuddy.json'), 'utf-8'));
    expect(manifest.dependencies).toEqual({});
    expect(fs.existsSync(path.join(pack, '.github', 'workflows', 'release.yml'))).toBe(true);
  });

  it('rejects a feature id that is not an identifier', () => {
    const result = run('node', [CLI, 'add', 'feature', 'my-notes'], pack);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/must start with a lowercase letter and contain only letters and digits/);
  });

  it('adds a feature, builds, typechecks and packs a verified bundle', async () => {
    expect(run('node', [CLI, 'add', 'feature', 'notes', '--label', 'Notes'], pack).code).toBe(0);

    const build = run('node', [CLI, 'build'], pack);
    expect(build.code, build.output).toBe(0);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'index.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'fe.js'))).toBe(true);

    const tsc = run(TSC, ['--noEmit'], pack);
    expect(tsc.code, tsc.output).toBe(0);

    const out = path.join(tmp, 'out');
    const packed = run('node', [CLI, 'pack', '--out', out], pack);
    expect(packed.code, packed.output).toBe(0);
    const extracted = await extractBundleArchive(path.join(out, 'demo-pack-0.1.0.tgz'), path.join(tmp, 'extract'));
    expect(verifyBundle(extracted).id).toBe('demo-pack');
  }, 240_000);

  it('fails the build on an unresolvable dependency', () => {
    const manifestPath = path.join(pack, 'abuddy.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.dependencies = { 'nonexistent-pack': '*' };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const build = run('node', [CLI, 'build'], pack);
    expect(build.code).not.toBe(0);
    expect(build.output).toMatch(/Unresolved pack dependencies:[\s\S]*nonexistent-pack/);
  }, 120_000);
});
