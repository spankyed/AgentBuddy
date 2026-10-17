import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { readPackBuild } from '@apackdev/host/packs';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import * as installations from '../../src/build/compiler-installation.ts';
import { createPackBuilder, type PackBuilder } from '../../src/build/build-process.ts';
import type { PackFrontendAddress } from '../../src/build/frontend-process.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';

let builder: PackBuilder | undefined;
let temporary: string | undefined;
let watcher: Awaited<ReturnType<typeof startPackBuildWatcher>> | undefined;
let pack: ReturnType<typeof fixture>;
const workspaces: string[] = [];
beforeEach(async () => {
  pack = fixture();
  const create = fs.mkdtempSync;
  vi.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    const directory = create(prefix);
    if (String(prefix).includes('apack-vite-')) workspaces.push(directory);
    return directory;
  });
  // The subject is replacement of an already published generation.
  await builder!.build();
});
afterEach(async () => {
  await watcher?.close();
  await builder?.close();
  vi.restoreAllMocks();
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
});

/** A private distributable compiler; only its Vue plugin is changed between generations. */
function fixture() {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-frontend-generation-'));
  const source = installations.compilerPackageDirectory();
  const compiler = path.join(temporary, 'compiler');
  fs.cpSync(source, compiler, { recursive: true });
  fs.mkdirSync(path.join(compiler, 'node_modules'), { recursive: true });
  const inputs = readPackageInputs([{ id: 'compiler', directory: source }]);
  for (const [name, index] of Object.entries(inputs.nodes[inputs.roots[0]!.node]!.dependencies)) {
    if (index === null) continue;
    const destination = path.join(compiler, 'node_modules', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(inputs.nodes[index]!.directory, destination, 'dir');
  }
  const plugin = path.join(compiler, 'node_modules/@vitejs/plugin-vue');
  const original = fs.realpathSync(plugin);
  fs.unlinkSync(plugin);
  fs.cpSync(original, plugin, { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(plugin, 'node_modules'), 'dir');
  const entry = path.join(plugin, 'dist/index.mjs');
  fs.renameSync(entry, path.join(plugin, 'dist/original.mjs'));
  const generation = (value: string) => fs.writeFileSync(entry, `import vue from './original.mjs';
    export * from './original.mjs'; export default options => [vue(options), {name:'generation-test',
    transform(code,id){if(id.split('?')[0].endsWith('.vue')) return code.replaceAll('VIEW',${JSON.stringify(value)})+'\\n//${value}';}}];`);
  generation('GENERATION_A');
  const root = path.join(temporary, 'pack');
  packFixture({ at: root, manifest: { id: 'frontend-generation', name: 'Frontend generation', features: {},
    extensions: { appExtensions: { view: 'src/View.vue' } } },
  files: { 'src/View.vue': '<template><p>VIEW</p></template>' } });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  // Keep Vite's writable optimizer/cache directory private while resolving the real installed packages.
  for (const name of fs.readdirSync(path.join(REPO_ROOT, 'node_modules')).filter(name => !name.startsWith('.'))) {
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules', name), path.join(root, 'node_modules', name), 'dir');
  }
  vi.spyOn(installations, 'compilerPackageDirectory').mockReturnValue(compiler);
  const captures = vi.spyOn(installations, 'captureCompilerInstallation');
  builder = createPackBuilder(root);
  return { root, entry, generation, captures };
}

async function response(address: PackFrontendAddress, template = false): Promise<string> {
  const suffix = template ? '?vue&type=template&id=generation' : '';
  const result = await fetch(`http://localhost:${address.port}/src/View.vue${suffix}`, { signal: AbortSignal.timeout(2_000) });
  const text = await result.text();
  if (!result.ok) throw new Error(text);
  return text;
}

it('refreshes backend and live frontend together, retains failed incumbents and awaits retirement', async () => {
  const { root, entry, generation, captures } = pack;
  const addresses: PackFrontendAddress[] = [];
  await builder!.serveFrontend(address => { if (address) addresses.push(address); });
  const first = addresses[0]!;
  expect(await response(first)).toContain('GENERATION_A');
  expect(fs.readFileSync(path.join(root, 'dist/runtime/fe.js'), 'utf8')).toContain('GENERATION_A');
  const revision = readPackBuild(path.join(root, 'dist')).revision;

  fs.writeFileSync(path.join(root, 'src/View.vue'), '<template><p>VIEW_SECOND</p></template>');
  await vi.waitFor(async () => expect(await response(first, true)).toContain('GENERATION_A_SECOND'), { timeout: 2_000 });
  fs.writeFileSync(entry, `throw new Error('BROKEN FRONTEND GENERATION'); export default () => {};`);
  await expect(builder!.build()).rejects.toThrow('Pack frontend exited before readiness');
  expect(readPackBuild(path.join(root, 'dist')).revision).toBe(revision);
  expect(addresses).toHaveLength(1);
  expect(await response(first)).toContain('GENERATION_A');

  generation('GENERATION_B');
  watcher = await startPackBuildWatcher(root, { builder: builder! });
  const second = addresses.at(-1)!;
  expect(second.pid).not.toBe(first.pid);
  expect(await response(second)).toContain('GENERATION_B');
  expect(fs.readFileSync(path.join(root, 'dist/runtime/fe.js'), 'utf8')).toContain('GENERATION_B_SECOND');
  expect(() => process.kill(first.pid, 0)).toThrow();
  const accepted = await captures.mock.results[0]!.value;
  expect(fs.existsSync(accepted.bin)).toBe(false);
  await watcher.close();
  expect(await response(second)).toContain('GENERATION_B');

  await builder!.close();
  expect(() => process.kill(second.pid, 0)).toThrow();
  for (const result of captures.mock.results) {
    const installation = await result.value;
    expect(fs.existsSync(installation.bin)).toBe(false);
  }
  expect(workspaces.length).toBeGreaterThanOrEqual(3);
  for (const workspace of workspaces) expect(fs.existsSync(workspace)).toBe(false);
});
