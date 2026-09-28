import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractPackArchive, verifyPack } from '@abuddy/host/packs';
import { callCli, typecheckPack } from '../_support/pack-builds';

/**
 * The commands `abuddy` answers to, read from `src/index.ts`'s COMMANDS table — the authority. Read as text
 * rather than imported because that module calls `main()` at the top level, which is why the test support
 * keeps its own map; a second hand-written list here would be a third copy that nothing keeps honest.
 */
const CLI_COMMANDS: string[] = (() => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'src', 'index.ts'), 'utf-8');
  const table = /const COMMANDS[^{]*\{([\s\S]*?)\n\};/.exec(source)?.[1];
  if (table === undefined) throw new Error("couldn't find the COMMANDS table in src/index.ts");
  return [...table.matchAll(/^\s*'([\w-]+)':/gm)].map((m) => m[1]!);
})();

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
});

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
  });

  /**
   * The facade round trip, on a pack scaffolded the way an author gets one. `abuddy facade-report` existed
   * for a while before the scaffold gave anyone a reason to run it — the command was offered to every pack
   * and used by one, since `abuddy init` wrote no `etc/` — so its external-pack path had never been
   * exercised. Scaffolding the workflow is what makes this a test rather than a fiction.
   */
  it('records the facade dependents compile against, and then reports it up to date', async () => {
    // No feature added: every pack has a facade, and the cases here share one pack in declaration order
    const build = await callCli(pack, 'build');
    expect(build.code, build.output).toBe(0);

    const report = path.join(pack, 'etc', 'pack-types.api.md');
    // Nothing is recorded before the first update: there is no report to be stale against
    expect(fs.existsSync(report)).toBe(false);
    const missing = await callCli(pack, 'facade-report');
    expect(missing.code, missing.output).toBe(1);
    expect(missing.output).toContain("doesn't exist");

    const written = await callCli(pack, 'facade-report', ['--update']);
    expect(written.code, written.output).toBe(0);
    expect(fs.readFileSync(report, 'utf-8')).toContain('Facade types report for the "demo-pack" pack');

    const checked = await callCli(pack, 'facade-report');
    expect(checked.code, checked.output).toBe(0);
    expect(checked.output).toContain('is up to date');
  });

  /** Both workflows the scaffold writes run only scripts the scaffold also writes, or abuddy commands */
  it('scaffolds workflows whose every step names something that exists', () => {
    const scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(pack, 'package.json'), 'utf-8')).scripts);
    const workflows = ['ci.yml', 'release.yml'].map((name) => path.join(pack, '.github', 'workflows', name));
    for (const file of workflows) expect(fs.existsSync(file), `${path.basename(file)} was not scaffolded`).toBe(true);

    const steps = workflows.flatMap((file) => [...fs.readFileSync(file, 'utf-8').matchAll(/^\s*- run: (.+)$/gm)].map((m) => m[1]!.trim()));
    expect(steps.length, 'no run steps were read out of the workflows').toBeGreaterThan(0);
    const unknown = steps.filter((step) => {
      const script = /^npm run ([\w:-]+)/.exec(step)?.[1];
      if (script !== undefined) return !scripts.includes(script);
      const command = /^npx abuddy ([\w-]+)/.exec(step)?.[1];
      if (command !== undefined) return !CLI_COMMANDS.includes(command);
      return false; // npm ci, npm test and the like are not ours to check
    });
    expect(unknown, 'these workflow steps name a script or command the scaffold does not provide').toEqual([]);
  });

  it('adds a step (registered, shipped in build/steps.build.mjs) and a service that build', async () => {
    // produces: the step whose generated register/build files are asserted below
    expect((await callCli(pack, 'add', ['step', 'ping'])).code).toBe(0);
    // produces: the service whose manifest and generated files are asserted below
    expect((await callCli(pack, 'add', ['service', 'cache'])).code).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(pack, 'abuddy.json'), 'utf-8')).packServices).toEqual({ cache: 'src/extensions/services/cache.ts#cacheService' });
    const stepsDir = path.join(pack, 'src', 'extensions', 'steps');
    expect(fs.readFileSync(path.join(stepsDir, 'register.ts'), 'utf-8')).toMatch(/import \{ pingStep \} from '\.\/ping\/index\.ts';[\s\S]*\[[\s\S]*pingStep,/);
    expect(fs.readFileSync(path.join(stepsDir, 'build.ts'), 'utf-8')).toMatch(/import \{ pingStepBuild \} from '\.\/ping\/build\.ts';[\s\S]*\[[\s\S]*pingStepBuild,/);

    // produces: the build whose steps.build.mjs is imported below
    const build = await callCli(pack, 'build');
    expect(build.code, build.output).toBe(0);
    const stepsBuild = await import(path.join(pack, 'dist', 'build', 'steps.build.mjs'));
    expect(stepsBuild.steps.map((step: { type: string }) => step.type)).toEqual(['ping']);

    // typecheck: as above
    const tsc = await typecheckPack(pack);
    expect(tsc.code, tsc.output).toBe(0);
  });

  it('regenerates entries when a source file codegen reads changes, not only the manifest', async () => {
    const servicePath = path.join(pack, 'src', 'extensions', 'services', 'cache.ts');
    fs.writeFileSync(servicePath, 'export const cacheService = {};\n');

    // produces: regenerates services.ts, whose content is asserted below
    const generate = await callCli(pack, 'generate-entries');
    expect(generate.output).not.toMatch(/inputs unchanged/);
    expect(fs.readFileSync(path.join(pack, 'src', '__generated__', 'services.ts'), 'utf-8')).toMatch(/import \{ cacheService as __service_cache \}/);
    // process: the stdout a second, unchanged run prints is the assertion
    expect(run('node', [CLI, 'generate-entries'], pack).output).toMatch(/inputs unchanged/);
  });

  it('keeps unit tests runnable after init-tests adds Playwright specs', async () => {
    // produces: the Playwright specs the vitest run below picks up
    expect((await callCli(pack, 'init-tests')).code).toBe(0);
    expect(fs.existsSync(path.join(pack, 'tests', 'e2e', 'smoke.spec.ts'))).toBe(true);

    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const unit = run(path.join(REPO_ROOT, 'node_modules', '.bin', 'vitest'), ['run'], pack);
    expect(unit.code, unit.output).toBe(0);
    expect(unit.output).toMatch(/tests\/demo-pack\.spec\.ts/);
    // The scaffold's seed test and the added feature's system test run through the harness
    expect(unit.output).toMatch(/tests\/features\/notes\/be\/system\.spec\.ts/);
    // Matching the control character is the job: this strips ANSI colour from captured output.
    // eslint-disable-next-line no-control-regex
    const unitOutput = unit.output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(unitOutput).toMatch(/Tests\s+\d+ passed/);
    expect(unitOutput).not.toMatch(/failed/);
  });

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
  });

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
  });
});
