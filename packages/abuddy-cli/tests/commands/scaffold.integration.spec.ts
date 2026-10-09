// @slow: eleven cases, and the costly ones run the real CLI end to end — init, build, typecheck, pack
// Measured 2026-10-06: 4.4s to add a feature and pack a verified archive, 3.4s to add a step and a service
// that build, then 2.1s, 2.1s, 1.6s and 1.6s. What makes it slow is what it checks — that the generated
// scaffold survives a real toolchain outside the monorepo — so the cost is the subject, and a faked CLI or
// a skipped typecheck would check the fixture instead.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractPackArchive, verifyPack } from '@abuddy/host/packs';
import { parse as parseYaml } from 'yaml';
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
 */const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');

let tmp: string;
let pack: string;
/** What `init` printed: it names scripts, so it is held to the same rule as the files it wrote */
let initOutput: string;

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
  const init = await callCli(tmp, 'init', ['demo-pack']);
  expect(init.code).toBe(0);
  initOutput = init.output;
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
    expect(fs.existsSync(path.join(pack, 'src', 'content', 'flows', 'heartbeat.ts'))).toBe(false);
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

    // produces: the dist files and apply JSON asserted just below
    const build = await callCli(pack, 'build');
    expect(build.code, build.output).toBe(0);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'index.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'fe.js'))).toBe(true);
    // The scaffold's example entry content the pack's own entity type from markdown
    const examples = JSON.parse(fs.readFileSync(path.join(pack, 'dist', 'runtime', 'content', 'examples.content.json'), 'utf-8'));
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
   * The facade round trip through the **scripts the scaffold writes**, on a pack scaffolded the way an author
   * gets one: `abuddy init` writes no `etc/`, so a pack's report appears at its first `facade:update`, and
   * what this holds is that the two scripts it ships work in that order on a pack nobody has edited.
   *
   * What the command decides — that it re-bundles the facade rather than reading `dist`, and so needs no
   * build — is `tests/commands/facade-report.integration.spec.ts`. The build here is this file's subject
   * rather than that one's precondition.
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

  /**
   * Every file the scaffold ships that names a command — both workflows and the README — held to the scripts
   * it also ships. A README or a workflow step naming a script that does not exist is the same rot, so one
   * rule reads both.
   *
   * The workflows are **parsed**, not scanned. The first version of this matched `/^\s*- run: /`, which a
   * step written with a `name:` does not begin with — `release.yml`'s tag check is one, so the case was
   * reading 8 of its 9 steps while claiming all of them. Measured before this was fixed: pointing that step
   * at `npm run does-not-exist` left the case green. Parsing also means a malformed template throws here
   * rather than at a pack author's first push.
   */
  it('names only scripts and commands that exist, everywhere the scaffold names one', () => {
    const scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(pack, 'package.json'), 'utf-8')).scripts);
    /** npm subcommands that are npm's own and run no script, so a scaffolded file may name them freely */
    const NOT_A_SCRIPT = ['ci', 'install', 'i'];
    /** The first words that mean "this line runs something", and so must resolve to something that exists */
    const RUNNERS = ['npm', 'npx', 'yarn', 'pnpm', 'bunx', 'abuddy'];

    /**
     * What a line names and cannot honour, or nothing when it can.
     *
     * The default is to **report**, not to ignore. The version this replaced recognised `npm run x` and
     * `npx abuddy y` and fell through for everything else, which silently passed `npm nonexistent`,
     * `abuddy nonexistent` and `yarn run x` — three holes that were one hole, the fall-through. A line whose
     * first word is a runner has to resolve here; a line that is shell (`test "v$(…)"`, `echo`) is not ours.
     */
    const unknown = (line: string): string | undefined => {
      const [first = '', second = '', third = ''] = line.split(/\s+/);
      if (!RUNNERS.includes(first)) return undefined;
      // `npm run x`, and npm's lifecycle shorthands, which do run a script of that name
      if (first === 'npm') {
        const script = second === 'run' ? third : ['test', 'start'].includes(second) ? second : undefined;
        if (script !== undefined) return scripts.includes(script) ? undefined : `npm run ${script}`;
        return NOT_A_SCRIPT.includes(second) ? undefined : `npm ${second}`;
      }
      const command = first === 'abuddy' ? second : second === 'abuddy' ? third : undefined;
      if (command === undefined) return `${first} ${second}`; // a runner invoking something that is not ours
      return CLI_COMMANDS.includes(command) ? undefined : `abuddy ${command}`;
    };

    const offenders: string[] = [];
    const judge = (where: string, lines: readonly string[]) => {
      offenders.push(...lines.map((line) => unknown(line.trim())).filter((x): x is string => x !== undefined).map((x) => `${where}: ${x}`));
    };

    for (const name of ['ci.yml', 'release.yml']) {
      const file = path.join(pack, '.github', 'workflows', name);
      expect(fs.existsSync(file), `${name} was not scaffolded`).toBe(true);
      const text = fs.readFileSync(file, 'utf-8');
      // Throws on a malformed template rather than reading nothing out of it
      const workflow = parseYaml(text) as { jobs?: Record<string, { steps?: { run?: string }[] }> };
      const runSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => (job.steps ?? []).filter((step) => typeof step.run === 'string'));
      // Steps against steps, not lines against steps: a multi-line `run: |` block inflates a line count, and
      // the loose comparison this replaced would pass while the walk had missed a whole step. A literal
      // `run:` inside a block scalar's body would fail this — rare, loud, and fixable by adjusting the count
      expect(runSteps.length, `${name}: parsed a different number of run steps than the file has`)
        .toBe((text.match(/^\s*-? ?run:/gm) ?? []).length);
      judge(name, runSteps.flatMap((step) => step.run!.split('\n')));
    }

    const readme = fs.readFileSync(path.join(pack, 'README.md'), 'utf-8');
    const named = [...readme.matchAll(/`((?:npm|npx|abuddy)(?: [\w:-]+)+)`/g)].map((m) => m[1]!);
    expect(named.length, 'the README names no commands, so this passed over nothing').toBeGreaterThan(0);
    judge('README.md', named);

    // What `init` prints is the first thing an author reads, and it names scripts that can be renamed
    const printed = initOutput.split('\n').map((line) => line.trim()).filter((line) => RUNNERS.includes(line.split(/\s+/)[0] ?? ''));
    expect(printed.length, "init printed no commands, so this passed over nothing").toBeGreaterThan(0);
    judge('init output', printed);

    expect(offenders, 'these name a script or command the scaffold does not provide').toEqual([]);
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
    // The scaffold's content test and the added feature's system test run through the harness
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
    // The failed build left the previous one where it was: it assembles `dist` aside and renames it into
    // place, so a reader finds the build before this one rather than nothing
    expect(fs.existsSync(path.join(pack, 'dist', 'runtime', 'index.cjs'))).toBe(true);
    // **Which is why `pack` asks whether that build is of these sources**, rather than failing for want of
    // files as it used to. The manifest edited above is newer than the build, so this is refused and names it
    // process: the exit code and the message are the assertion
    const packed = run('node', [CLI, 'pack', '--out', path.join(tmp, 'stale-out')], pack);
    expect(packed.code).not.toBe(0);
    expect(packed.output).toMatch(/build is older than abuddy\.json/);
  });
});
