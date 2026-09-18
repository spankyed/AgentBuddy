// A pack depending on default-setup runs default-setup's systems in its unit tests: the harness loads
// the dependency's cached runtime (runtime/index.cjs, with its compiled seeds) on the pack's SDK.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const DEFAULT_SETUP_DIST = path.join(REPO_ROOT, 'packages', 'default-setup', 'dist');
const built = fs.existsSync(path.join(DEFAULT_SETUP_DIST, 'runtime', 'index.cjs')) && fs.existsSync(path.join(DEFAULT_SETUP_DIST, 'snapshot.json'));
if (!built && process.env.CI) throw new Error('default-setup must be built (abuddy build and dev-build.mjs) for the dependency runtime spec');

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

/** A pack depending on default-setup, with default-setup cached as `abuddy build` caches a dependency */
function dependentPack(spec: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-dependent-runtime-'));
  dirs.push(root);
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  write(root, 'package.json', JSON.stringify({ name: 'dependent-pack', type: 'module' }));
  write(root, 'abuddy.json', JSON.stringify({ id: 'dependent-pack', name: 'Dependent', version: '1.0.0', dependencies: { 'default-setup': '*' } }));
  const dep = path.join(root, '.abuddy', 'deps', 'default-setup');
  fs.mkdirSync(path.join(dep, 'runtime', 'seeds'), { recursive: true });
  fs.copyFileSync(path.join(DEFAULT_SETUP_DIST, 'snapshot.json'), path.join(dep, 'snapshot.json'));
  fs.copyFileSync(path.join(DEFAULT_SETUP_DIST, 'runtime', 'index.cjs'), path.join(dep, 'runtime', 'index.cjs'));
  for (const file of fs.readdirSync(DEFAULT_SETUP_DIST)) {
    if (file.endsWith('.seed.json') || file === 'seeds.json') fs.copyFileSync(path.join(DEFAULT_SETUP_DIST, file), path.join(dep, 'runtime', 'seeds', file));
  }
  write(root, 'vitest.config.ts', `
import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';
const dataDir = isolatedDataDir('dependent-runtime-');
export default defineConfig({
  test: { include: ['tests/*.spec.ts'], env: dataDir.env, globalSetup: dataDir.globalSetup, setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] },
});`);
  write(root, 'tests/setup.ts', `
import { setupPackTests } from '@abuddy/testing/harness';
import { memos } from './memos-system';
await setupPackTests({
  seedRuntime: { id: 'dependent-pack', entities: {}, relKinds: {}, repositories: {}, seedHooks: {} },
  registration: {
    id: 'dependent-pack',
    systems: [{ id: 'memos', machine: memos, events: new Set(['SAVE', 'NOTIFY']) }],
    // A hand-written registration declares what its plugin receives, as a generated one does: the bus
    // drops a send to a plugin nothing declares
    receivedEventTypes: { memos: ['MEMOS_STARTED', 'MEMOS_NOTIFIED'] },
    features: [{ id: 'widgets', hasSystem: false, services: [], settings: { plugins: { widgets: { size: 3 } } } }],
  },
});`);
  // A system that sends to its plugin as it starts (before a client connects) and on NOTIFY, and reports an error on SAVE
  write(root, 'tests/memos-system.ts', `
import { setup } from 'xstate';
import { sendToPlugin } from '@abuddy/sdk/events';
import { reportError } from '@abuddy/sdk/logger';
export const memos = setup({}).createMachine({
  entry: () => sendToPlugin('memos', { type: 'MEMOS_STARTED' }),
  on: {
    NOTIFY: { actions: () => sendToPlugin('memos', { type: 'MEMOS_NOTIFIED' }) },
    SAVE: { actions: () => reportError({ error: new Error('lost memo'), source: 'memos' }) },
  },
});`);
  write(root, 'tests/app.spec.ts', spec);
  return root;
}

function vitest(root: string) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run'], {
    cwd: root, encoding: 'utf-8', env: { ...process.env, CI: '', NO_COLOR: '1', FORCE_COLOR: '0' }, timeout: 120_000,
  });
}

describe.skipIf(!built)("a dependent pack's unit tests on the harness runtime tier", () => {
  it("runs default-setup's settings system and receives its startup data", () => {
    const root = dependentPack(`
import { expect, it } from 'vitest';
import { repository } from '@abuddy/ears';
import { services } from '@abuddy/sdk/services';
import { startApp } from '@abuddy/testing/harness';
it('connects to default-setup settings', async () => {
  const app = await startApp({ systems: ['settings'] });
  await app.connect();
  const loaded = await app.nextEmit('settings', 'SETTINGS_LOADED');
  expect(loaded.data).toMatchObject({ general: expect.any(Object), plugins: expect.any(Object) });
  expect(app.emitted('application').map((e) => e.type)).toContain('APPLICATION_HOTKEYS');
  // One SDK and one engine: this pack's feature settings (registered by the harness) reach default-setup's
  // settings, and the repositories default-setup's runtime registered are the test's, through
  // @abuddy/ears and services.repository alike
  expect((loaded.data as { plugins: Record<string, unknown> }).plugins.widgets).toEqual({ size: 3 });
  const settingsQueries = Reflect.get(repository, 'settingsQueries');
  expect(settingsQueries).toBeDefined();
  expect(Reflect.get(services.repository, 'settingsQueries')).toBe(settingsQueries);
});`);
    const result = vitest(root);
    expect(result.stdout + result.stderr, 'the dependent pack test run').toMatch(/Tests\s+1 passed/);
  }, 180_000);

  it("drops a system's sends to its plugin until a client connects", () => {
    const root = dependentPack(`
import { expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
it('delivers only what the system sends once connected', async () => {
  const app = await startApp({ systems: ['memos'] });
  expect(app.emitted('memos')).toEqual([]);
  await app.connect();
  await app.send('memos', { type: 'NOTIFY' });
  expect(app.emitted('memos').map((e) => e.type)).toEqual(['MEMOS_NOTIFIED']);
});`);
    const result = vitest(root);
    expect(result.stdout + result.stderr, 'the dependent pack test run').toMatch(/Tests\s+1 passed/);
  }, 180_000);

  it("fails a test when a system reports an error the test didn't take", () => {
    const root = dependentPack(`
import { expect, it } from 'vitest';
import { startApp, takeSystemErrors } from '@abuddy/testing/harness';
async function save() {
  const app = await startApp({ systems: ['memos'] });
  await app.connect();
  await app.send('memos', { type: 'SAVE' });
}
it('reports without taking', save);
it('reports and takes', async () => {
  await save();
  expect(takeSystemErrors()).toEqual([expect.objectContaining({ type: 'SYSTEM_ERROR', source: 'memos', message: 'lost memo' })]);
});`);
    const output = (({ stdout, stderr }) => stdout + stderr)(vitest(root));
    expect(output).toMatch(/Tests\s+1 failed \| 1 passed/);
    expect(output).toContain("Systems reported errors the test didn't take (takeSystemErrors()):");
    expect(output).toContain('memos: lost memo');
  }, 180_000);
});
