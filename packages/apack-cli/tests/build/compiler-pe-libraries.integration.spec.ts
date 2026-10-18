import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackBuild } from '@apackdev/host/packs';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';
import { createPackBuilder } from '../../src/build/build-process.ts';
import { relativeCompilerPath } from '@apackdev/host/build/compiler-inputs';
import { formatNodeOptions, parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from '../../src/build/compiler-installation.ts';
import { startPackFrontend, type PackFrontend } from '../../src/build/frontend-process.ts';
import { nativeAddonSource } from '../_support/native-addon.ts';
import { parsePeLibraryMetadata } from '../../src/build/compiler-pe-libraries.ts';
import { BUILD_INPUTS_DIRECTORY_ENV } from '../../src/build/compiler-read-tree.ts';
import type { CapturedNativeModule } from '../../src/build/compiler-native-input-owner.ts';
import { readPeLoaderMetadata, capturePeLibraryEnvironment } from '../../src/build/compiler-pe-environment.ts';

/** Bind the value IAT while retaining the lookup table needed when Windows cannot reuse the binding. */
function bindValueImport(bytes: Buffer, address: bigint, timeStamp: number) {
  const pe = bytes.readUInt32LE(60), optional = pe + 24;
  const sections = optional + bytes.readUInt16LE(pe + 20);
  const offset = (rva: number) => {
    for (let i = 0; i < bytes.readUInt16LE(pe + 6); i++) {
      const at = sections + i * 40, base = bytes.readUInt32LE(at + 12), size = bytes.readUInt32LE(at + 16);
      if (rva >= base && rva - base < size) return bytes.readUInt32LE(at + 20) + rva - base;
    }
    throw new Error('Fixture import RVA has no file-backed section');
  };
  for (let descriptor = offset(bytes.readUInt32LE(optional + 112 + 8)); bytes.readUInt32LE(descriptor + 12); descriptor += 20) {
    const name = offset(bytes.readUInt32LE(descriptor + 12));
    if (bytes.toString('ascii', name, bytes.indexOf(0, name)) !== 'apack_value.dll') continue;
    const iat = offset(bytes.readUInt32LE(descriptor + 16));
    expect(bytes.readBigUInt64LE(iat + 8)).toBe(0n);
    expect(bytes.readUInt32LE(descriptor)).not.toBe(0);
    bytes.writeUInt32LE(timeStamp, descriptor + 4);
    bytes.writeUInt32LE(0xffffffff, descriptor + 8); // No bound forwarder chain.
    bytes.writeBigUInt64LE(address, iat);
    return;
  }
  throw new Error('Fixture has no value DLL import');
}

function createPeNativeFixture(root: string, pack: string, bound = false) {
  const compile = (args: string[]) => execFileSync('cl.exe', ['/nologo', '/MT', ...args], { cwd: root, timeout: 15_000 });
  const headers = process.env.APACK_TEST_NODE_HEADERS;
  const importLibrary = process.env.APACK_TEST_NODE_IMPORT_LIBRARY;
  expect(headers, 'run the disposable Windows native SDK setup').toBeTruthy();
  expect(importLibrary).toBeTruthy();
  const binding = path.join(pack, 'binding');
  fs.mkdirSync(binding);
  const library = path.join(binding, 'apack_value.dll');
  const addon = path.join(binding, 'addon.node');
  const dllMarker = path.join(root, 'dll-initialized');
  const addonMarker = path.join(root, 'addon-initialized');
  const buildLibrary = (file: string, value: number) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const source = file + '.c';
    fs.writeFileSync(source, `#include <windows.h>
__declspec(dllexport) int native_value(void) { return ${value}; }
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID reserved) {
  if (reason == DLL_PROCESS_ATTACH) {
    HANDLE marker = CreateFileW(L${JSON.stringify(dllMarker)}, GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (marker != INVALID_HANDLE_VALUE) CloseHandle(marker);
  }
  return TRUE;
}`);
    compile(['/LD', source, '/Fo' + path.join(root, 'value.obj'), '/link', '/INCREMENTAL:NO',
      ...(bound ? ['/DYNAMICBASE:NO', '/FIXED'] : []),
      '/OUT:' + file, '/IMPLIB:' + path.join(root, 'value.lib')]);
  };
  buildLibrary(library, 11);
  const source = path.join(root, 'addon.c');
  fs.writeFileSync(source, nativeAddonSource(addonMarker));
  compile(['/LD', '/I' + headers!, source, '/Fo' + path.join(root, 'addon.obj'), '/link', '/INCREMENTAL:NO',
    '/OUT:' + addon, path.join(root, 'value.lib'), importLibrary!]);
  return { library, addon, dllMarker, addonMarker, buildLibrary };
}

it.runIf(process.platform === 'win32').each([
  { bound: false, label: 'named imports, Unicode paths' },
  { bound: true, label: 'bound imports with lookup fallback' },
])('owns retained PE libraries and refuses outside DLLs before initialization ($label)', async ({ bound }) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pe-libraries-')));
  const pack = path.join(root, bound ? 'pack' : 'pack-é');
  const previousOptions = process.env.NODE_OPTIONS;
  const pathKey = Object.keys(process.env).sort().find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  const previousPath = process.env[pathKey];
  let compiler: CompilerInstallation | undefined;
  let frontend: PackFrontend | undefined;
  let candidate: PackFrontend | undefined;
  const signal = new AbortController().signal;
  const normalize = (file: string) => fs.realpathSync.native(file).toLowerCase();
  try {
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>PE_BEFORE</template>' } });
    const { library, addon, dllMarker, addonMarker, buildLibrary } = createPeNativeFixture(root, pack, bound);
    const metadata = parsePeLibraryMetadata(fs.readFileSync(addon));
    expect(metadata.machine).toBe(0x8664);
    expect(metadata.imports.map(imported => imported.name.toLowerCase())).toContain('apack_value.dll');
    expect(metadata.exports.some(exported => exported.names.includes('napi_register_module_v1'))).toBe(true);
    expect(parsePeLibraryMetadata(fs.readFileSync(library)).exports.some(exported => exported.names.includes('native_value'))).toBe(true);
    const observe = () => JSON.parse(execFileSync(process.execPath, ['-e',
      `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({value:addon.read(),libraries:process.report.getReport().sharedObjects}));`],
    { encoding: 'utf8', timeout: 10_000 })) as { value: number; libraries: string[] };
    if (bound) {
      expect(observe().value).toBe(11);
      fs.rmSync(dllMarker); fs.rmSync(addonMarker);
      const target = parsePeLibraryMetadata(fs.readFileSync(library));
      const exported = target.exports.find(exported => exported.names.includes('native_value'))!;
      const bytes = fs.readFileSync(addon);
      bindValueImport(bytes, target.imageBase + BigInt(exported.address), target.timeStamp);
      fs.writeFileSync(addon, bytes);
      expect(parsePeLibraryMetadata(bytes).imports.find(imported => imported.name === 'apack_value.dll')?.symbols)
        .toEqual([{ name: 'native_value' }]);
    }
    const ordinary = observe();
    expect(ordinary.value).toBe(11);
    expect(ordinary.libraries.map(normalize)).toContain(normalize(library));
    expect(fs.existsSync(dllMarker)).toBe(true);
    expect(fs.existsSync(addonMarker)).toBe(true);
    fs.rmSync(dllMarker); fs.rmSync(addonMarker);
    const proof = path.join(root, 'loaded.json');
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')] && require('node:worker_threads').isMainThread) {
      process.report.excludeEnv = true;
      const addon = require(${JSON.stringify(addon)});
      if (!process.report.excludeEnv) throw new Error('Native admission changed report privacy policy');
      const fs = require('node:fs'), path = require('node:path');
      const workspace = process.env[${JSON.stringify(BUILD_INPUTS_DIRECTORY_ENV)}];
      const receipt = JSON.parse(fs.readFileSync(path.join(workspace, 'native-inputs-0.json'), 'utf8'));
      const owner = receipt.modules.find(module => fs.realpathSync.native(module.source).toLowerCase() === fs.realpathSync.native(${JSON.stringify(addon)}).toLowerCase());
      fs.writeFileSync(${JSON.stringify(proof)}, JSON.stringify({value:addon.read(),workspace,owner}));
    }`);
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: pack });
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
    frontend = await startPackFrontend(pack, compiler, signal);
    const loaded = JSON.parse(fs.readFileSync(proof, 'utf8')) as { value: number; workspace: string; owner: CapturedNativeModule };
    expect(loaded.value).toBe(11);
    expect(loaded.owner).toBeDefined();
    const owned = relativeCompilerPath(loaded.workspace, loaded.owner.captured);
    expect(path.isAbsolute(owned)).toBe(false);
    expect(owned).not.toMatch(/^\.\.(?:\\|\/|$)/);
    const expectedLibrary = normalize(path.join(path.dirname(loaded.owner.captured), 'apack_value.dll'));
    const modules = readPeLoaderMetadata(capturePeLibraryEnvironment().systemDirectory, frontend.address.pid).libraries;
    expect(modules.map(normalize)).not.toContain(normalize(library));
    expect(modules.filter(file => path.basename(file).toLowerCase() === 'apack_value.dll').map(normalize)).toEqual([expectedLibrary]);
    expect(await frontend.isCurrent(signal)).toBe(true);
    const original = fs.readFileSync(library), mode = fs.statSync(library).mode & 0o777;
    const replacement = path.join(root, 'replacement/apack_value.dll');
    buildLibrary(replacement, 22);
    fs.renameSync(replacement, library);
    expect(await frontend.isCurrent(signal)).toBe(false);
    fs.writeFileSync(replacement, original, { mode }); fs.renameSync(replacement, library);
    expect(await frontend.isCurrent(signal)).toBe(true);
    const view = `http://localhost:${frontend.address.port}/src/View.vue`;
    expect(await (await fetch(view)).text()).toContain('PE_BEFORE');
    fs.writeFileSync(path.join(pack, 'src/View.vue'), '<template>PE_AFTER</template>');
    await vi.waitFor(async () => expect(await (await fetch(view)).text()).toContain('PE_AFTER'), { timeout: 2_000 });
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const selected = path.join(outside, 'apack_value.dll');
    fs.renameSync(library, selected);
    process.env[pathKey] = [outside, previousPath].filter(Boolean).join(path.delimiter);
    const escaped = observe();
    expect(escaped.value).toBe(11);
    expect(escaped.libraries.map(normalize)).toContain(normalize(selected));
    fs.rmSync(dllMarker); fs.rmSync(addonMarker);
    await expect(startPackFrontend(pack, compiler, signal).then(value => { candidate = value; })).rejects.toThrow();
    expect(fs.existsSync(dllMarker)).toBe(false);
    expect(fs.existsSync(addonMarker)).toBe(false);
    expect(frontend.alive()).toBe(true);
    expect(await (await fetch(view)).text()).toContain('PE_AFTER');
  } finally {
    if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousOptions;
    if (previousPath === undefined) delete process.env[pathKey];
    else process.env[pathKey] = previousPath;
    try { await candidate?.close(); await frontend?.close(); }
    finally { await compiler?.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});

it.runIf(process.platform === 'win32').each(['preload', 'thread', 'preload-and-thread'] as const)(
  'captures PE %s inputs and preserves publication after outside-library refusal', async site => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pe-publication-')));
    const pack = path.join(root, 'pack');
    const previousOptions = process.env.NODE_OPTIONS;
    const pathKey = Object.keys(process.env).sort().find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
    const previousPath = process.env[pathKey];
    let builder: ReturnType<typeof createPackBuilder> | undefined;
    const started = performance.now();
    const checkpoint = (phase: string) => console.info(`[PE ${site}] ${phase}: ${((performance.now() - started) / 1000).toFixed(2)}s`);
    try {
      packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {},
        ...(site !== 'preload' ? { content: { formats: { rows: { compiler: 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
          sources: { rows: { path: 'src/value.txt', format: 'rows' } } } } : {}) },
        files: { 'src/value.txt': 'input', 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
      const { library, addon, dllMarker, addonMarker } = createPeNativeFixture(root, pack);
      const ordinaryLoad = `const addon = require(${JSON.stringify(addon)}); const result = {value:addon.read(),library:addon.libraryPath()};`;
      const ordinaryScript = site === 'preload-and-thread'
        ? `${ordinaryLoad} new (require('node:worker_threads').Worker)(${JSON.stringify(ordinaryLoad + " require('node:worker_threads').parentPort.postMessage(result);")}, {eval:true})
            .once('message', worker => console.log(JSON.stringify({...result, worker})));`
        : ordinaryLoad + ' console.log(JSON.stringify(result));';
      const ordinary = () => JSON.parse(execFileSync(process.execPath, ['-e',
        ordinaryScript], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, NODE_OPTIONS: previousOptions } })) as {
        value: number; library: string; worker?: { value: number; library: string };
      };
      const baseline = ordinary();
      expect(baseline.value).toBe(11);
      expect(fs.realpathSync.native(baseline.library).toLowerCase()).toBe(fs.realpathSync.native(library).toLowerCase());
      if (site === 'preload-and-thread') {
        expect(baseline.worker?.value).toBe(11);
        expect(fs.realpathSync.native(baseline.worker!.library).toLowerCase()).toBe(fs.realpathSync.native(library).toLowerCase());
      }
      checkpoint('ordinary loader control');
      fs.rmSync(dllMarker); fs.rmSync(addonMarker);
      const proof = path.join(root, 'loaded.jsonl');
      const load = `const addon = require(${JSON.stringify(addon)});
const {threadId} = require('node:worker_threads');
require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({thread:threadId,value:addon.read(),library:addon.libraryPath(),workspace:process.env[${JSON.stringify(BUILD_INPUTS_DIRECTORY_ENV)}]}) + '\\n');`;
      if (site !== 'thread') {
        const preload = path.join(root, 'preload.cjs');
        fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.startup')]) { ${load} }`);
        process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
      }
      if (site !== 'preload') {
        fs.writeFileSync(path.join(pack, 'src/compiler.ts'), `import { Worker } from 'node:worker_threads';
export default () => new Promise((resolve, reject) => {
  const worker = new Worker(${JSON.stringify(`if (!globalThis[Symbol.for('apack.compiler.startup')]) throw new Error('Native thread has no input owner');
${load}
require('node:worker_threads').parentPort.postMessage('NATIVE');`)}, {eval:true});
  worker.once('message', name => resolve([{entity:'Relation',name}]));
  worker.once('error', reject);
  worker.once('exit', code => { if (code) reject(new Error('Native thread exited with ' + code)); });
});`);
      }
      builder = createPackBuilder(pack);
      await builder.build({ args: ['--skip-fe'] });
      checkpoint('initial build completed');
      const results = fs.readFileSync(proof, 'utf8').trim().split('\n').map(line => JSON.parse(line)) as {
        thread: number; value: number; library: string; workspace: string;
      }[];
      expect(results.length).toBeGreaterThan(0);
      if (site === 'preload-and-thread') {
        expect(results.some(result => result.thread === 0)).toBe(true);
        expect(results.some(result => result.thread > 0)).toBe(true);
      }
      for (const result of results) {
        if (site === 'thread') expect(result.thread).toBeGreaterThan(0);
        expect(result.value).toBe(11);
        expect(path.basename(result.library)).toBe('apack_value.dll');
        const relative = relativeCompilerPath(result.workspace, result.library);
        expect(path.isAbsolute(relative)).toBe(false);
        expect(relative).not.toMatch(/^\.\.(?:\\|\/|$)/);
        expect(fs.existsSync(result.workspace)).toBe(false);
      }
      const inputs = readPackBuildInputs(path.join(pack, 'dist'));
      assertPackBuildInputsCurrent(pack, inputs);
      const original = fs.readFileSync(library), mode = fs.statSync(library).mode & 0o777;
      const replace = (bytes: Buffer | string) => {
        const file = path.join(root, 'replacement.dll');
        fs.writeFileSync(file, bytes, { mode }); fs.renameSync(file, library);
      };
      replace('CHANGED');
      expect(() => assertPackBuildInputsCurrent(pack, inputs)).toThrow();
      replace(original);
      assertPackBuildInputsCurrent(pack, inputs);
      checkpoint('source replacement and restoration checked');
      const revision = readPackBuild(path.join(pack, 'dist')).revision;
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      const selected = path.join(outside, 'apack_value.dll');
      fs.renameSync(library, selected);
      process.env[pathKey] = [outside, previousPath].filter(Boolean).join(path.delimiter);
      const escaped = ordinary();
      expect(escaped.value).toBe(11);
      expect(fs.realpathSync.native(escaped.library).toLowerCase()).toBe(fs.realpathSync.native(selected).toLowerCase());
      if (site === 'preload-and-thread') {
        expect(escaped.worker?.value).toBe(11);
        expect(fs.realpathSync.native(escaped.worker!.library).toLowerCase()).toBe(fs.realpathSync.native(selected).toLowerCase());
      }
      checkpoint('outside loader control');
      fs.rmSync(dllMarker); fs.rmSync(addonMarker); fs.rmSync(proof);
      await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow();
      expect(fs.existsSync(dllMarker)).toBe(false);
      expect(fs.existsSync(addonMarker)).toBe(false);
      expect(fs.existsSync(proof)).toBe(false);
      expect(readPackBuild(path.join(pack, 'dist')).revision).toBe(revision);
      checkpoint('refused candidate retained publication');
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
      if (previousPath === undefined) delete process.env[pathKey];
      else process.env[pathKey] = previousPath;
      try { await builder?.close(); }
      finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  },
  120_000,
);
