import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractPackArchive, verifyPack } from '@abuddy/host/packs';
import { callCli, typecheckPack } from '../helpers/pack-builds';

/**
 * The scaffold an outside author starts from must build, typecheck and pack as
 * generated. Runs the real CLI in a temp dir outside the monorepo; only the
 * toolchain's node_modules are borrowed from the repo (no Electron).
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');

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

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-scaffold-'));
  // produces: the shared demo-pack every test below reads; the code check is a fixture guard
  expect((await callCli(tmp, 'init', ['demo-pack'])).code).toBe(0);
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
    // process: the exit code and the message an author reads are the assertion
    const result = run('node', [CLI, 'add', 'flow', 'heartbeat'], pack);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/"dependencies": \{ "default-setup": "\*" \}/);
    expect(fs.existsSync(path.join(pack, 'src', 'seeds', 'flows', 'heartbeat.ts'))).toBe(false);
  });

  it('rejects a feature id that is not an identifier', () => {
    // process: the exit code and the message an author reads are the assertion
    const result = run('node', [CLI, 'add', 'feature', 'my-notes'], pack);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/must start with a lowercase letter and contain only letters and digits/);
  });

  it('adds a feature, builds, typechecks and packs a verified archive', async () => {
    // produces: the feature the build below compiles
    expect((await callCli(pack, 'add', ['feature', 'notes', '--label', 'Notes'])).code).toBe(0);

    // produces: the dist files and seed JSON asserted just below
    const build = await callCli(pack, 'build');
    expect(build.code, build.output).toBe(0);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'index.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'fe.js'))).toBe(true);
    // The scaffold's example entry seeds the pack's own entity type from markdown
    const examples = JSON.parse(fs.readFileSync(path.join(pack, 'dist', 'runtime', 'seeds', 'examples.seed.json'), 'utf-8'));
    expect(examples.records).toEqual([expect.objectContaining({ entity: 'DemoPack', title: 'Hello', content: expect.stringContaining('hello.md') })]);

    // typecheck: the TypeScript API builds the same program tsc --noEmit would, in this process
    const tsc = await typecheckPack(pack);
    expect(tsc.code, tsc.output).toBe(0);

    const out = path.join(tmp, 'out');
    // produces: the archive extractPackArchive/verifyPack read below
    const packed = await callCli(pack, 'pack', ['--out', out]);
    expect(packed.code, packed.output).toBe(0);
    const extracted = await extractPackArchive(path.join(out, 'demo-pack-0.1.0.tgz'), path.join(tmp, 'extract'));
    expect(verifyPack(extracted).id).toBe('demo-pack');
  }, 240_000);

  it('adds a step (registered, shipped in build/steps.build.mjs) and a service that build', async () => {
    // produces: the step whose generated register/build files are asserted below
    expect((await callCli(pack, 'add', ['step', 'ping'])).code).toBe(0);
    // produces: the service whose manifest and generated files are asserted below
    expect((await callCli(pack, 'add', ['service', 'cache'])).code).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(pack, 'abuddy.json'), 'utf-8')).packServices).toEqual({ cache: 'src/extensions/services/cache.ts#cacheService' });
    const stepsDir = path.join(pack, 'src', 'extensions', 'steps');
    expect(fs.readFileSync(path.join(stepsDir, 'register.ts'), 'utf-8')).toMatch(/import \{ pingStep \} from '\.\/ping';[\s\S]*\[[\s\S]*pingStep,/);
    expect(fs.readFileSync(path.join(stepsDir, 'build.ts'), 'utf-8')).toMatch(/import \{ pingStepBuild \} from '\.\/ping\/build';[\s\S]*\[[\s\S]*pingStepBuild,/);

    // produces: the build whose steps.build.mjs is imported below
    const build = await callCli(pack, 'build');
    expect(build.code, build.output).toBe(0);
    const stepsBuild = await import(path.join(pack, 'dist', 'build', 'steps.build.mjs'));
    expect(stepsBuild.steps.map((step: { type: string }) => step.type)).toEqual(['ping']);

    // typecheck: as above
    const tsc = await typecheckPack(pack);
    expect(tsc.code, tsc.output).toBe(0);
  }, 240_000);

  it('regenerates entries when a source file codegen reads changes, not only the manifest', async () => {
    const servicePath = path.join(pack, 'src', 'extensions', 'services', 'cache.ts');
    fs.writeFileSync(servicePath, 'export const cacheService = {};\n');

    // produces: regenerates services.ts, whose content is asserted below
    const generate = await callCli(pack, 'generate-entries');
    expect(generate.output).not.toMatch(/inputs unchanged/);
    expect(fs.readFileSync(path.join(pack, 'src', '__generated__', 'services.ts'), 'utf-8')).toMatch(/import \{ cacheService as __service_cache \}/);
    // process: the stdout a second, unchanged run prints is the assertion
    expect(run('node', [CLI, 'generate-entries'], pack).output).toMatch(/inputs unchanged/);
  }, 120_000);

  it('keeps unit tests runnable after init-tests adds Playwright specs', async () => {
    // produces: the Playwright specs the vitest run below picks up
    expect((await callCli(pack, 'init-tests')).code).toBe(0);
    expect(fs.existsSync(path.join(pack, 'tests', 'e2e', 'smoke.spec.ts'))).toBe(true);

    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const unit = run(path.join(REPO_ROOT, 'node_modules', '.bin', 'vitest'), ['run'], pack);
    expect(unit.code, unit.output).toBe(0);
    expect(unit.output).toMatch(/tests\/unit\/demo-pack\.spec\.ts/);
    // The scaffold's seed test and the added feature's system test run through the harness
    expect(unit.output).toMatch(/tests\/unit\/notes-system\.spec\.ts/);
    const unitOutput = unit.output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(unitOutput).toMatch(/Tests\s+\d+ passed/);
    expect(unitOutput).not.toMatch(/failed/);
  }, 120_000);

  it('refuses to build, pack or generate entries for a manifest the installer would reject', () => {
    const manifestPath = path.join(pack, 'abuddy.json');
    const original = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(original);
    manifest.features[0].id = 'notes_v2';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    try {
      for (const args of [['build'], ['pack', '--out', path.join(tmp, 'invalid-out')], ['generate-entries', '--force']]) {
        // process: each command's exit code and message for an invalid manifest is the assertion
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

    // process: the exit code and the unresolved-dependency message are the assertion
    const build = run('node', [CLI, 'build'], pack);
    expect(build.code).not.toBe(0);
    expect(build.output).toMatch(/Unresolved pack dependencies:[\s\S]*nonexistent-pack/);
    // The failed build left no earlier output behind for abuddy pack to ship
    expect(fs.existsSync(path.join(pack, 'dist'))).toBe(false);
    // process: the exit code after a failed build is the assertion
    expect(run('node', [CLI, 'pack', '--out', path.join(tmp, 'stale-out')], pack).code).not.toBe(0);
  }, 120_000);
});
