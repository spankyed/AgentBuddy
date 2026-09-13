import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractBundleArchive, verifyBundle } from '@abuddy/host/packs';

/**
 * The scaffold an outside author starts from must build, typecheck and pack as
 * generated. Runs the real CLI in a temp dir outside the monorepo; only the
 * toolchain's node_modules are borrowed from the repo (no Electron).
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');
// The borrowed node_modules link the workspace @abuddy/* packages, which typecheck from source
const TSC_ARGS = ['--noEmit', '--customConditions', '@abuddy/source'];

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
    const workflow = fs.readFileSync(path.join(pack, '.github', 'workflows', 'release.yml'), 'utf-8');
    // A runner has no installed app, so the build resolves built-in dependencies from a downloaded beta
    expect(workflow).toMatch(/runs-on: macos-14/);
    expect(workflow).toMatch(/ABUDDY_APP: beta/);
  });

  it("explains instead of writing a flow the scaffold can't build (no dependency provides steps)", () => {
    const result = run('node', [CLI, 'add', 'flow', 'heartbeat'], pack);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/"dependencies": \{ "default-setup": "\*" \}/);
    expect(fs.existsSync(path.join(pack, 'src', 'seeds', 'flows', 'heartbeat.ts'))).toBe(false);
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

    const tsc = run(TSC, TSC_ARGS, pack);
    expect(tsc.code, tsc.output).toBe(0);

    const out = path.join(tmp, 'out');
    const packed = run('node', [CLI, 'pack', '--out', out], pack);
    expect(packed.code, packed.output).toBe(0);
    const extracted = await extractBundleArchive(path.join(out, 'demo-pack-0.1.0.tgz'), path.join(tmp, 'extract'));
    expect(verifyBundle(extracted).id).toBe('demo-pack');
  }, 240_000);

  it('adds a step (registered, shipped in build/steps.build.mjs) and a service that build', async () => {
    expect(run('node', [CLI, 'add', 'step', 'ping'], pack).code).toBe(0);
    expect(run('node', [CLI, 'add', 'service', 'cache'], pack).code).toBe(0);
    const stepsDir = path.join(pack, 'src', 'extensions', 'steps');
    expect(fs.readFileSync(path.join(stepsDir, 'register.ts'), 'utf-8')).toMatch(/import \{ pingStep \} from '\.\/ping';[\s\S]*\[[\s\S]*pingStep,/);
    expect(fs.readFileSync(path.join(stepsDir, 'build.ts'), 'utf-8')).toMatch(/import \{ pingStepBuild \} from '\.\/ping\/build';[\s\S]*\[[\s\S]*pingStepBuild,/);

    const build = run('node', [CLI, 'build'], pack);
    expect(build.code, build.output).toBe(0);
    const stepsBuild = await import(path.join(pack, 'dist', 'build', 'steps.build.mjs'));
    expect(stepsBuild.steps.map((step: { type: string }) => step.type)).toEqual(['ping']);

    const tsc = run(TSC, TSC_ARGS, pack);
    expect(tsc.code, tsc.output).toBe(0);
  }, 240_000);

  it('regenerates entries when a source file codegen reads changes, not only the manifest', () => {
    const servicePath = path.join(pack, 'src', 'extensions', 'services', 'cache.ts');
    fs.writeFileSync(servicePath, 'export const cacheService = {};\n');

    const generate = run('node', [CLI, 'generate-entries'], pack);
    expect(generate.output).not.toMatch(/inputs unchanged/);
    expect(fs.readFileSync(path.join(pack, 'src', '__generated__', 'services.ts'), 'utf-8')).toMatch(/import \{ cacheService \}/);
    expect(run('node', [CLI, 'generate-entries'], pack).output).toMatch(/inputs unchanged/);
  }, 120_000);

  it('keeps unit tests runnable after init-tests adds Playwright specs', () => {
    expect(run('node', [CLI, 'init-tests'], pack).code).toBe(0);
    expect(fs.existsSync(path.join(pack, 'tests', 'e2e', 'smoke.spec.ts'))).toBe(true);

    const unit = run(path.join(REPO_ROOT, 'node_modules', '.bin', 'vitest'), ['run'], pack);
    expect(unit.code, unit.output).toBe(0);
    expect(unit.output).toMatch(/tests\/unit\/demo-pack\.spec\.ts/);
  }, 120_000);

  it('refuses to build or pack a manifest the installer would reject', () => {
    const manifestPath = path.join(pack, 'abuddy.json');
    const original = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(original);
    manifest.features[0].id = 'notes_v2';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    try {
      for (const args of [['build'], ['pack', '--out', path.join(tmp, 'invalid-out')]]) {
        const result = run('node', [CLI, ...args], pack);
        expect(result.code, args.join(' ')).not.toBe(0);
        expect(result.output).toMatch(/abuddy\.json is invalid/);
      }
    } finally {
      fs.writeFileSync(manifestPath, original);
    }
  }, 120_000);

  it('fails the build on an unresolvable dependency', () => {
    const manifestPath = path.join(pack, 'abuddy.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.dependencies = { 'nonexistent-pack': '*' };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const build = run('node', [CLI, 'build'], pack);
    expect(build.code).not.toBe(0);
    expect(build.output).toMatch(/Unresolved pack dependencies:[\s\S]*nonexistent-pack/);
    // The failed build left no earlier output behind for abuddy pack to ship
    expect(fs.existsSync(path.join(pack, 'dist'))).toBe(false);
    expect(run('node', [CLI, 'pack', '--out', path.join(tmp, 'stale-out')], pack).code).not.toBe(0);
  }, 120_000);
});
