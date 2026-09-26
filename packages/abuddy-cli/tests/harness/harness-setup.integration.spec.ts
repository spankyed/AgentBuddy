// Where the harness finds the pack, and which tests it runs: a pack's unit tests run from anywhere with --root,
// tests that run concurrently, or test files sharing the harness, fail naming why, and a pack scaffolded before the harness gets its setup from `abuddy add feature`.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { callCli } from '../helpers/pack-builds';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');
const VITEST = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function write(root: string, file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf-8', env: { ...process.env, CI: '', NO_COLOR: '1', FORCE_COLOR: '0' }, timeout: 180_000,
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A pack with no dependencies whose unit tests run its data code on the harness */
function dataPack(spec: string, manifest: Record<string, unknown> = {}): string {
  const root = tempDir('abuddy-harness-setup-');
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  write(root, 'package.json', JSON.stringify({ name: 'data-pack', type: 'module' }));
  write(root, 'abuddy.json', JSON.stringify({ id: 'data-pack', name: 'Data', version: '1.0.0', ...manifest }));
  // As `abuddy init` scaffolds it
  write(root, 'vitest.config.ts', `
import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';
const dataDir = isolatedDataDir('harness-setup-');
export default defineConfig({
  test: { include: ['tests/*.spec.ts'], env: dataDir.env, globalSetup: dataDir.globalSetup, setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] },
});`);
  write(root, 'tests/setup.ts', `
import { setupPackTests } from '@abuddy/testing/harness';
await setupPackTests({ seedRuntime: { id: 'data-pack', entities: {}, relKinds: {}, repositories: {}, seedHooks: {} } });`);
  write(root, 'tests/pack.spec.ts', spec);
  return root;
}

describe("a pack's unit tests on the harness", () => {
  it('find the pack from the vitest project root when run from another directory (--root)', () => {
    const root = dataPack(`
import { expect, it } from 'vitest';
import { importSeeds } from '@abuddy/testing/harness';
it('seeds nothing', async () => {
  expect(await importSeeds()).toEqual({});
});`);
    // inherent: runs a pack's own vitest suite from another cwd — the nested runner is the thing under test
    const result = run(process.execPath, [VITEST, 'run', '--root', root], tempDir('abuddy-elsewhere-'));
    expect(result.output).toMatch(/Tests\s+1 passed/);
  });

  // A seed runtime registers no features, yet an action the test runs sends to the pack's own through services.emitter
  it("let services.emitter send to the features the pack's manifest declares", () => {
    const root = dataPack(`
import { expect, it } from 'vitest';
import { services } from '@abuddy/sdk/services';
it('sends to its own system and plugin', () => {
  expect(() => services.emitter.sendToSystem('data-pack/notes', { type: 'GET_NOTES' })).not.toThrow();
  expect(() => services.emitter.broadcastToPlugin('data-pack/notes', { type: 'NOTES_UPDATED' })).not.toThrow();
  expect(() => services.emitter.broadcastToPlugin('data-pack/ghost', { type: 'NOTES_UPDATED' })).toThrow('No registered plugin is named "data-pack/ghost"');
});`, { features: [{ id: 'notes', system: { entry: 'src/features/notes/be/system.ts' }, plugin: { entry: 'src/features/notes/fe/index.ts' } }] });
    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const result = run(process.execPath, [VITEST, 'run'], root);
    expect(result.output).toMatch(/Tests\s+1 passed/);
  });

  it('fail naming why when test files share the harness (vitest isolate off)', () => {
    const spec = `
import { expect, it } from 'vitest';
import { importSeeds } from '@abuddy/testing/harness';
it('seeds nothing', async () => {
  expect(await importSeeds()).toEqual({});
});`;
    const root = dataPack(spec);
    write(root, 'tests/other.spec.ts', spec);
    const config = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf-8');
    write(root, 'vitest.config.ts', config.replace("test: { include:", "test: { isolate: false, fileParallelism: false, include:"));
    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const result = run(process.execPath, [VITEST, 'run'], root);
    expect(result.output).toContain('setupPackTests() already ran in this process');
    expect(result.output).toContain('`isolate` on (the default)');
  });

  it('fail concurrent tests, naming why', () => {
    const root = dataPack(`
import { it } from 'vitest';
it.concurrent('one', async () => {});
it.concurrent('two', async () => {});`);
    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const result = run(process.execPath, [VITEST, 'run'], root);
    expect(result.output).toMatch(/Tests\s+2 failed/);
    expect(result.output).toContain('"one" runs concurrently: harness tests share one database, service mocks and apps per file');
  });

  it("run a concurrent test nothing runs alongside: alone in its group, or next to skipped ones", () => {
    const root = dataPack(`
import { describe, it } from 'vitest';
it.concurrent('alone', async () => {});
it('after it', async () => {});
describe.concurrent('a concurrent suite', () => {
  it('runs', async () => {});
  it.skip('skipped', async () => {});
});`);
    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const result = run(process.execPath, [VITEST, 'run'], root);
    expect(result.output).toMatch(/Tests\s+3 passed \| 1 skipped/);
  });
});

describe('abuddy add feature in a pack without the unit test setup', () => {
  it('adds the harness setup its system test runs on, and the test passes', async () => {
    const tmp = tempDir('abuddy-pre-harness-');
    // produces: the pre-harness pack the test then strips and re-adds a feature to
    expect((await callCli(tmp, 'init', ['old-pack'])).code).toBe(0);
    const pack = path.join(tmp, 'old-pack');
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(pack, 'node_modules'), 'dir');
    // As a pack scaffolded before the harness: no tests/setup.ts, a vitest config of its own, no harness dependency
    fs.rmSync(path.join(pack, 'tests'), { recursive: true });
    const pkgPath = path.join(pack, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    delete pkg.devDependencies['@abuddy/testing'];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    // process: the report the command prints, line by line, is the assertion
    const added = run(process.execPath, [CLI, 'add', 'feature', 'notes'], pack);

    expect(added.code, added.output).toBe(0);
    expect(added.output).toContain('+ tests/setup.ts');
    expect(added.output).toContain('+ tests/unit/notes-system.spec.ts');
    expect(added.output).toContain('vitest.config.ts already exists');
    expect(added.output).toContain('Added @abuddy/testing to devDependencies. Run: npm install');
    expect(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).devDependencies['@abuddy/testing']).toMatch(/^\^/);
    // The kept config is the scaffold's, which loads tests/setup.ts
    // inherent: runs a pack's own vitest suite — the nested runner is the thing under test
    const unit = run(process.execPath, [VITEST, 'run'], pack);
    expect(unit.output).toMatch(/tests\/unit\/notes-system\.spec\.ts/);
    expect(unit.output).toMatch(/Tests\s+1 passed/);
  });
});
