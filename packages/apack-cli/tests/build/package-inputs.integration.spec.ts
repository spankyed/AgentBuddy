import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as sdkBuild from '@apackdev/sdk/build';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { callCli, preparePack, packageJson, tsconfig } from '../_support/pack-builds.ts';
import { assertGeneratedCurrent } from '../../src/commands/generate-entries.ts';
import { dependencyTypes } from '../../src/commands/generate.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';
import { runtimePack, vueRuntimePack } from '../_support/frontend-pack.ts';
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';
import { bundlePackFE } from '../../src/build/fe-bundler.ts';
import { runPackBuild } from '../../src/build/build-process.ts';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';
import { packInputFiles } from '@apackdev/host/build/pack-inputs';

let root: string | undefined;
afterEach(() => { vi.restoreAllMocks(); if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });

function runtimeConsumer() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-imported-runtime-'));
  return runtimePack(root);
}

function vueRuntimeConsumer(kind: 'inline' | 'external' | 'linked' = 'inline') {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-imported-runtime-'));
  return vueRuntimePack(root, kind);
}

it('rebuilds the frontend when an undeclared imported package changes behind unchanged types', async () => {
  const { pack, helper, frontend } = runtimeConsumer();
  const first = await callCli(pack, 'build');
  expect(first.code, first.output).toBe(0);
  expect(fs.readFileSync(frontend, 'utf8')).toContain('BEFORE');
  fs.writeFileSync(helper, "export const marker = 'AFTERX';");
  const second = await callCli(pack, 'build');
  expect(second.code, second.output).toBe(0);
  expect(second.output).not.toContain('fe: unchanged, reused');
  expect(fs.readFileSync(frontend, 'utf8')).toContain('AFTERX');
  expect(fs.readFileSync(frontend, 'utf8')).not.toContain('BEFORE');
});

it.each(['inline', 'external', 'linked'] as const)('invalidates compiler inputs and recompiles a Vue-only import (%s script)', async kind => {
  const { pack, helper, frontend } = vueRuntimeConsumer(kind);
  const inputs = captureCompilationInputs(pack);
  const compile = async () => {
    const result = await bundlePackFE({ packDir: pack, entryPoint: path.join(pack, 'src/canvas.vue'),
      outputDir: path.dirname(frontend) });
    expect(result.success, result.error).toBe(true);
  };
  await compile();
  expect(fs.readFileSync(frontend, 'utf8')).toContain('BEFORE');
  fs.writeFileSync(helper, "export const marker = 'AFTERX';");
  expect(() => inputs.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  await compile();
  expect(fs.readFileSync(frontend, 'utf8')).toContain('AFTERX');
  expect(fs.readFileSync(frontend, 'utf8')).not.toContain('BEFORE');
});

it.each([
  { name: 'TypeScript state', create: runtimeConsumer },
  { name: 'Vue canvas', create: vueRuntimeConsumer },
])('automatically rebuilds an undeclared runtime imported by $name without a type or authored edit', async ({ create }) => {
  const { pack, helper, frontend } = create();
  let watcher: { close(): Promise<void> } | undefined;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let publications = 0;
  try {
    watcher = await startPackBuildWatcher(pack, {
      place: { env: 'test', userDataDir: path.join(root!, 'profile') },
      onBuilt: async () => { publications++; },
    });
    expect(fs.readFileSync(frontend, 'utf8')).toContain('BEFORE');
    fs.writeFileSync(helper, "export const marker = 'AFTERX';");
    await vi.waitFor(() => expect(publications > 0 || errors.mock.calls.length > 0).toBe(true), { timeout: 20_000 });
    expect(errors.mock.calls).toEqual([]);
    expect(fs.readFileSync(frontend, 'utf8')).toContain('AFTERX');
    expect(fs.readFileSync(frontend, 'utf8')).not.toContain('BEFORE');
  } finally { await watcher?.close(); }
});

async function consumer() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-installed-types-'));
  const modules = path.join(root, 'node_modules');
  fs.mkdirSync(path.join(modules, '@apackdev'), { recursive: true });
  for (const name of ['sdk', 'ears']) fs.symlinkSync(path.join(REPO_ROOT, 'node_modules/@apackdev', name), path.join(modules, '@apackdev', name), 'dir');
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules/xstate'), path.join(modules, 'xstate'), 'dir');
  const library = path.join(modules, 'external-events');
  fs.mkdirSync(library);
  fs.writeFileSync(path.join(library, 'package.json'), JSON.stringify({ name: 'external-events', version: '1.0.0',
    exports: { '.': { types: './index.d.ts', default: './index.js' } } }));
  fs.writeFileSync(path.join(library, 'index.js'), 'throw new Error("Do not activate declaration providers");');
  const declarations = (event: string) => `export type Contract = { incoming: { type: 'FETCH' }; outgoing: { type: '${event}' } };`;
  fs.writeFileSync(path.join(library, 'index.d.ts'), declarations('BEFORE'));
  const manifest = { id: 'type-consumer', name: 'Type Consumer', version: '1.0.0',
    features: { view: { description: 'Imported event contract.', system: { entry: 'src/system.ts', contract: 'src/contract.ts#Contract' },
      plugin: { label: 'View', state: 'src/plugin.ts' } } } };
  const pack = preparePack(root, manifest.id, {
    'apack.json': JSON.stringify(manifest),
    'package.json': JSON.stringify({ ...JSON.parse(packageJson(manifest.id)), dependencies: {
      'external-events': '1.0.0', '@apackdev/sdk': '0.1.0', '@apackdev/ears': '0.1.0', xstate: '^5.19.2' } }),
    'tsconfig.json': tsconfig, 'src/contract.ts': "export type { Contract } from 'external-events';",
    'src/plugin.ts': "import { createMachine } from 'xstate'; export default createMachine({ id: 'view' });",
    'src/system.ts': `import { setup } from 'xstate'; import { defineSystem } from '@apackdev/sdk/framework';
import type { Contract } from './contract.ts'; const spec = defineSystem<Contract>();
export default { spec, machine: setup({ types: spec.types }).createMachine({ id: 'view' }) };`,
  }, modules);
  const first = await callCli(pack, 'generate-entries');
  expect(first.code, first.output).toBe(0);
  const events = path.join(pack, 'src/__generated__/pack-entry.ts');
  expect(fs.readFileSync(events, 'utf8')).toContain('BEFORE');
  return { pack, library, manifest, events, declarations };
}

it('regenerates event metadata for changed installed types with unchanged package versions', async () => {
  const { pack, library, manifest, events, declarations } = await consumer();
  const packageBytes = fs.readFileSync(path.join(library, 'package.json'));
  fs.writeFileSync(path.join(library, 'index.d.ts'), declarations('AFTERX'));
  expect(() => assertGeneratedCurrent(pack, manifest, dependencyTypes(new Map()))).toThrow('inputs changed');
  const second = await callCli(pack, 'generate-entries');
  expect(second.code, second.output).toBe(0);
  expect(second.output).not.toContain('inputs unchanged');
  const updated = fs.readFileSync(events, 'utf8');
  expect(updated).toContain('AFTERX');
  expect(updated).not.toContain('BEFORE');
  expect(fs.readFileSync(path.join(library, 'package.json'))).toEqual(packageBytes);
});

it('preserves generated files when installed package bytes change during async generation', async () => {
  const { pack, library, events, declarations } = await consumer();
  const before = fs.readFileSync(events);
  const stampFile = path.join(pack, '.apack/generate-entries.json');
  const stamp = fs.readFileSync(stampFile);
  const generate = sdkBuild.generatePackFiles;
  vi.spyOn(sdkBuild, 'generatePackFiles').mockImplementationOnce(async (...args) => {
    const files = await generate(...args);
    fs.writeFileSync(path.join(library, 'index.d.ts'), declarations('RACED'));
    return files;
  });
  const refused = await callCli(pack, 'generate-entries', ['--force']);
  expect(refused.code, refused.output).toBe(1);
  expect(refused.output).toContain('Compiler or installed package inputs changed');
  expect(fs.readFileSync(events)).toEqual(before);
  expect(fs.readFileSync(stampFile)).toEqual(stamp);
});


it('keeps a captured build current after standalone generation with unchanged generated code', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-generation-inputs-'));
  const pack = preparePack(root, 'generation-inputs', {
    'apack.json': JSON.stringify({ id: 'generation-inputs', name: 'Generation Inputs', version: '1.0.0' }),
    'package.json': packageJson('generation-inputs'), 'tsconfig.json': tsconfig,
  }, path.join(REPO_ROOT, 'node_modules'));
  await runPackBuild(pack, { args: ['--skip-fe'] });
  const inputs = readPackBuildInputs(path.join(pack, 'dist'));
  assertPackBuildInputsCurrent(pack, inputs);
  const generated = () => Object.fromEntries(packInputFiles(pack, { generated: true })
    .filter(file => file.startsWith('src/__generated__/'))
    .map(file => [file, fs.readFileSync(path.join(pack, file), 'utf8')]));
  const before = generated();
  const stampFile = path.join(pack, '.apack/generate-entries.json');
  const stamp = fs.readFileSync(stampFile);
  const result = await callCli(pack, 'generate-entries');
  expect(result.code, result.output).toBe(0);
  expect(generated()).toEqual(before);
  expect(fs.readFileSync(stampFile)).not.toEqual(stamp);
  assertPackBuildInputsCurrent(pack, inputs);
  fs.appendFileSync(path.join(pack, 'src/__generated__/ears.ts'), '\n// changed generated module\n');
  expect(() => assertPackBuildInputsCurrent(pack, inputs)).toThrow('Compiler startup input changed');
});
