// @slow: real filesystem watching, staged builds, installation and HTTP-driven host runtime reload.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer } from 'node:http';
import { createActor, createMachine } from 'xstate';
import { expect, it, vi, type MockInstance } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { installedEngine } from '@apackdev/ears';
import { createSettingsStore, createSettingsService } from '@apackdev/host/settings';
import { startTestRuntime, resetTestData } from '@apackdev/sdk/testing';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { API_TOKEN_HEADER } from '@apackdev/sdk/utils/pure';
import { createPackRegistry, readPackBuild, stagePack } from '@apackdev/host/packs';
import { reloadPackById } from '@apackdev/host/packs/runtime';
import { HOST_ENTITY_TYPES } from '@apackdev/host/app-state';
import { packagesBuiltOrRefuse, REPO_ROOT } from '@apackdev/host/build/packages-built';
import { startPackBuildWatcher } from '../../src/build/watch';

const built = packagesBuiltOrRefuse('npm run packages:ensure');
let settings: ReturnType<typeof createSettingsService>;
const registry = createPackRegistry({ settingsForPack: id => settings.forPack(id) });
startTestRuntime({ appVersion: '1.0.0', entityTypes: HOST_ENTITY_TYPES, packs: registry });

interface WatchedPack {
  root: string;
  installed: string;
  hooks: string;
  shared: string;
  registry: ReturnType<typeof createPackRegistry>;
  errors: MockInstance<typeof console.error>;
  lifecycle(value: string): string;
  state: { reloads: number; publications: number };
}

async function withWatchedPack(run: (pack: WatchedPack) => Promise<void>): Promise<void> {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-watch-publication-'));
  const root = path.join(temporary, 'source');
  const marker = path.join(temporary, 'activated');
  const shared = path.join(temporary, 'shared');
  const hooks = path.join(temporary, 'hooks');
  resetTestData();
  settings = createSettingsService(createSettingsStore({ ears: installedEngine, catalog: registry.settingsCatalog }));
  vi.stubEnv('APACK_ENV', 'test');
  vi.stubEnv('APACK_USER_DATA_DIR', path.join(temporary, 'profile'));
  vi.stubEnv('SHIPPED_PACKS_DIR', '');
  const environment = resolveAppEnvironment();
  const installed = path.join(environment.packsDir, 'watched-pack');
  const backend = createActor(createMachine({})).start();
  const state = { reloads: 0, publications: 0 };
  const server = createServer(async (request, response) => {
    try {
      expect(request.headers[API_TOKEN_HEADER]).toBe('watch-test-token');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      expect(JSON.parse(Buffer.concat(chunks).toString()).packId).toBe('watched-pack');
      await reloadPackById(registry, 'watched-pack', backend);
      state.reloads++;
      response.end('ok');
    } catch (error) { response.statusCode = 500; response.end(String(error)); }
  });
  let watcher: { close: () => Promise<void> } | undefined;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const lifecycle = (value: string) => `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, '${value}'); export function init() { return '${value}'; }`;
  try {
    packFixture({ at: root, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: {
      id: 'watched-pack', name: 'Watched', features: { notes: { description: 'Initial purpose.' } },
      lifecycle: { onInit: 'modules/lifecycle.ts#init' },
    }, files: { 'modules/lifecycle.ts': lifecycle('first') } });
    fs.mkdirSync(shared);
    fs.mkdirSync(hooks);
    fs.renameSync(path.join(root, 'apack.json'), path.join(hooks, 'manifest.json'));
    fs.symlinkSync(path.join(hooks, 'manifest.json'), path.join(shared, 'manifest.json'));
    fs.symlinkSync(shared, path.join(root, 'config'), 'dir');
    fs.symlinkSync(path.join(root, 'config/manifest.json'), path.join(root, 'apack.json'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test API port');
    fs.mkdirSync(path.dirname(environment.apiPortFile), { recursive: true });
    fs.writeFileSync(environment.apiPortFile, JSON.stringify({ port: address.port, pid: process.pid }));
    fs.writeFileSync(environment.apiTokenFile, 'watch-test-token');
    watcher = await startPackBuildWatcher(root, {
      place: { env: 'test', userDataDir: environment.userDataDir },
      onBuilt: async () => { stagePack(root, installed); state.publications++; },
    });
    stagePack(root, installed);
    registry.refreshCatalog(environment.packsDir);
    expect(fs.existsSync(marker), 'catalog inspection must not activate pack modules').toBe(false);
    await reloadPackById(registry, 'watched-pack', backend);
    expect(registry.getPackRegistration('watched-pack')?.lifecycle?.onInit?.()).toBe('first');

    await run({ root, installed, hooks, shared, registry, errors, lifecycle, state });
  } finally {
    await watcher?.close();
    registry.unregisterPack('watched-pack');
    backend.stop();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    errors.mockRestore();
    vi.unstubAllEnvs();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

it.skipIf(!built)('publishes source and manifest edits together and retains the incumbent after refusal', async () => {
  await withWatchedPack(async ({ root, installed, registry, errors, lifecycle, state }) => {
    const initial = readPackBuild(path.join(root, 'dist'));
    // Neither declaration changes nor modules outside src/ may escape the watch contract.
    const manifestFile = path.join(root, 'apack.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.features.notes.description = 'Updated purpose.';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, 'modules/lifecycle.ts'), lifecycle('second'));
    await vi.waitFor(() => expect(state.reloads > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    const updated = readPackBuild(path.join(root, 'dist'));
    expect(updated.revision).not.toBe(initial.revision);
    expect(registry.catalog.get('watched-pack')?.buildRevision).toBe(readPackBuild(installed).revision);
    expect(registry.catalog.get('watched-pack')?.snapshot.manifest.features?.notes.description).toBe('Updated purpose.');
    expect(registry.getPackRegistration('watched-pack')?.lifecycle?.onInit?.()).toBe('second');

    const accepted = state.publications;
    fs.writeFileSync(path.join(root, 'modules/lifecycle.ts'), 'export function init( {');
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed')), { timeout: 20_000 });
    expect(state.publications).toBe(accepted);
    expect(readPackBuild(path.join(root, 'dist')).revision).toBe(updated.revision);
    expect(registry.getPackRegistration('watched-pack')?.lifecycle?.onInit?.()).toBe('second');
    fs.writeFileSync(path.join(root, 'modules/lifecycle.ts'), lifecycle('third'));
    await vi.waitFor(() => expect(state.publications).toBeGreaterThan(accepted), { timeout: 20_000 });
    await vi.waitFor(() => expect(registry.getPackRegistration('watched-pack')?.lifecycle?.onInit?.()).toBe('third'), { timeout: 20_000 });

  });
}, 60_000);

it.skipIf(!built)('reloads linked manifests after atomic replacement, retargeting and invalid edits', async () => {
  await withWatchedPack(async ({ root, hooks, shared, registry, errors, state }) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apack.json'), 'utf8'));
    // Only external data changes below: a root-only watcher cannot observe them.
    const changed = { ...manifest, features: { notes: { description: 'Atomic manifest replacement.' } } };
    fs.writeFileSync(path.join(hooks, 'replacement.json'), JSON.stringify(changed));
    fs.renameSync(path.join(hooks, 'replacement.json'), path.join(hooks, 'manifest.json'));
    await vi.waitFor(() => expect(registry.catalog.get('watched-pack')?.snapshot.manifest.features?.notes.description).toBe('Atomic manifest replacement.'), { timeout: 20_000 });
    const beforeRetarget = state.publications;
    changed.features.notes.description = 'Retargeted manifest.';
    errors.mockClear();
    fs.writeFileSync(path.join(hooks, 'retargeted.json'), '{');
    fs.unlinkSync(path.join(shared, 'manifest.json'));
    fs.symlinkSync(path.join(hooks, 'retargeted.json'), path.join(shared, 'manifest.json'));
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed')), { timeout: 20_000 });
    expect(state.publications).toBe(beforeRetarget);
    fs.writeFileSync(path.join(hooks, 'retargeted.json'), JSON.stringify(changed));
    await vi.waitFor(() => expect(registry.catalog.get('watched-pack')?.snapshot.manifest.features?.notes.description).toBe('Retargeted manifest.'), { timeout: 20_000 });
    expect(state.publications).toBeGreaterThan(beforeRetarget);
    changed.features.notes.description = 'Edited retargeted manifest.';
    fs.writeFileSync(path.join(hooks, 'retargeted.json'), JSON.stringify(changed));
    await vi.waitFor(() => expect(registry.catalog.get('watched-pack')?.snapshot.manifest.features?.notes.description).toBe('Edited retargeted manifest.'), { timeout: 20_000 });
  });
}, 60_000);
