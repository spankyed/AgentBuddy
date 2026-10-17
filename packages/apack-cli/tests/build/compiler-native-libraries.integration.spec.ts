import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';
import { createCompilerModuleLoader } from '../../src/build/compiler-modules.ts';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackBuild } from '@apackdev/host/packs';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';
import { createPackBuilder } from '../../src/build/build-process.ts';
import { formatNodeOptions, parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { withCompilerFileReads } from '@apackdev/host/build/compiler-inputs';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from '../../src/build/compiler-installation.ts';
import { startPackFrontend, type PackFrontend } from '../../src/build/frontend-process.ts';
import { assertCapturedMachOLibraries, captureMachOLibraryEnvironment } from '../../src/build/compiler-native-libraries.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';

function nativeFixture(mode: 'relative' | 'absolute' | 'transitive' | 'fallback' | 'framework', sdk?: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-libraries-')));
  try {
    const pack = path.join(root, 'pack');
    const native = path.join(root, 'native-package');
    const library = path.join(native, mode === 'framework' ? 'Value.framework/Versions/A/Value' : 'lib/libvalue.dylib');
    fs.mkdirSync(pack);
    fs.mkdirSync(path.dirname(library), { recursive: true });
    fs.mkdirSync(path.join(native, 'binding'));
    fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: 'native-fixture', version: '1.0.0', main: 'binding/addon.node' }));
    const marker = path.join(root, 'initialized');
    const outside = path.join(root, 'outside/liboutside.dylib');
    const architecture = ['-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64'];
    function buildLibrary(file: string, source: string, installName: string, dependencies: string[] = []) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const input = file + '.c';
      fs.writeFileSync(input, source);
      execFileSync('clang', [...architecture, '-dynamiclib', input, ...dependencies, '-Wl,-install_name,' + installName, '-o', file]);
    }
    if (mode === 'transitive') buildLibrary(outside, 'int outside_value(void) { return 11; }', outside);
    buildLibrary(library, mode === 'transitive'
      ? 'extern int outside_value(void); int native_value(void) { return outside_value(); }'
      : 'int native_value(void) { return 11; }',
    mode === 'absolute' ? library : mode === 'fallback' ? 'libvalue.dylib' : '@loader_path/../' + path.relative(native, library), mode === 'transitive' ? [outside] : []);
    const addonSource = path.join(native, 'binding/addon.c');
    fs.writeFileSync(addonSource, `#include <node_api.h>
#include <stdio.h>
extern int native_value(void);
static napi_value read_value(napi_env env, napi_callback_info info) {
  napi_value value; napi_create_int32(env, native_value(), &value); return value;
}
NAPI_MODULE_INIT() {
  FILE *marker = fopen(${JSON.stringify(marker)}, "w"); if (marker) fclose(marker);
  napi_value read; napi_create_function(env, "read", NAPI_AUTO_LENGTH, read_value, 0, &read);
  napi_set_named_property(env, exports, "read", read); return exports;
}`);
    execFileSync('clang', [...architecture, '-bundle', '-undefined', 'dynamic_lookup',
      '-I', path.resolve(path.dirname(process.execPath), '../include/node'), addonSource, library,
      ...(sdk ? ['-mmacosx-version-min=11.0', `-Wl,-platform_version,macos,11.0,${sdk}`] : []),
      '-o', path.join(native, 'binding/addon.node')]);
    fs.writeFileSync(path.join(pack, 'package.json'), '{"type":"commonjs"}');
    fs.writeFileSync(path.join(pack, 'tsconfig.json'), '{"compilerOptions":{"noLib":true,"types":[]}}');
    if (mode === 'absolute' || mode === 'transitive') {
      fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: 'native-fixture', version: '1.0.0', main: 'binding/addon.node', exports: './fallback.cjs' }));
      fs.writeFileSync(path.join(native, 'fallback.cjs'), 'module.exports = "JS_FALLBACK";');
      fs.mkdirSync(path.join(pack, 'node_modules'));
      fs.symlinkSync(native, path.join(pack, 'node_modules/native-fixture'), 'dir');
      fs.writeFileSync(path.join(pack, 'fallback.cjs'), 'module.exports = require("native-fixture");');
    }
    const entry = path.join(pack, 'compiler.cjs');
    // Extensionless file resolution must capture the selected native image's package too.
    fs.writeFileSync(entry, "module.exports = require('../native-package/binding/addon');");
    return { root, pack, native, library, marker, outside, entry, buildLibrary };
  } catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error; }
}

it.runIf(process.platform === 'darwin').each([
  ['fallback', '13.0'], ['fallback', '14.0'], ['framework', '13.0'], ['framework', '14.0'],
] as const)(
  'matches native default-fallback lookup for %s / SDK %s without touching system directories', (mode, sdk) => {
    const fixture = nativeFixture(mode, sdk);
    try {
      fs.rmSync(fixture.library);
      const entry = path.join(fixture.native, 'binding/addon.node');
      const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_OPTIONS' && !key.startsWith('DYLD_')));
      const fallback = mode === 'framework' ? '/Library/Frameworks/Value.framework/Versions/A/Value' : '/usr/local/lib/libvalue.dylib';
      const variable = mode === 'framework' ? 'DYLD_FALLBACK_FRAMEWORK_PATH' : 'DYLD_FALLBACK_LIBRARY_PATH';
      for (const setting of [undefined, '']) {
        const env = { ...environment, [variable]: setting };
        const actual = execFileSync(process.execPath, ['-e', `try { require(${JSON.stringify(entry)}) } catch (error) { console.log(error.message) }`], {
          encoding: 'utf8', env,
        });
        const probes: string[] = [];
        assertCapturedMachOLibraries(entry, fixture.native, { arch: process.arch,
          environment: captureMachOLibraryEnvironment(env), realpath: file => fs.realpathSync.native(file),
          read(file) { probes.push(file); return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined; },
        });
        const usesFallback = sdk === '13.0' && setting === undefined;
        expect(actual).toContain('Library not loaded:');
        expect(actual.includes(fallback)).toBe(usesFallback);
        expect(probes.includes(fallback)).toBe(usesFallback);
      }
      expect(fs.existsSync(fixture.marker)).toBe(false);
    } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
  },
);

function nativeLoad(fixture: ReturnType<typeof nativeFixture>, proof: string) {
  return `const addon = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))});
require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({ thread: require('node:worker_threads').threadId, value: addon.read(), libraries: process.report.getReport().sharedObjects }) + '\\n');`;
}

function nativeWorkerCompiler(load: string) {
  return `import { Worker } from 'node:worker_threads';
export default () => new Promise((resolve, reject) => {
  const worker = new Worker(${JSON.stringify(`if (!globalThis[Symbol.for('apack.compiler.startup')]) throw new Error('Native worker has no input owner');
${load}
require('node:worker_threads').parentPort.postMessage('NATIVE');`)}, { eval: true });
  worker.once('message', name => resolve([{ entity: 'Relation', name }]));
  worker.once('error', reject);
  worker.once('exit', code => { if (code) reject(new Error('Native compiler worker exited with code ' + code)); });
});`;
}

it('tracks retained Vite ESM preload and loader inputs without freezing Vue sources', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-vite-esm-inputs-')));
  const pack = path.join(root, 'pack');
  const previous = process.env.NODE_OPTIONS;
  let compiler: CompilerInstallation | undefined;
  let frontend: PackFrontend | undefined;
  const signal = new AbortController().signal;
  try {
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>VITE_ESM_BEFORE</template>' } });
    const dependency = path.join(root, 'node_modules/preload-dependency');
    fs.mkdirSync(dependency, { recursive: true });
    const metadata = path.join(dependency, 'package.json');
    const declaration = JSON.stringify({ name: 'preload-dependency', type: 'module', exports: './first.mjs' });
    fs.writeFileSync(metadata, declaration);
    fs.writeFileSync(path.join(dependency, 'first.mjs'), "export default 'FIRST';");
    fs.writeFileSync(path.join(dependency, 'second.mjs'), "export default 'SECOND';");
    const child = path.join(root, 'child.mjs');
    const childSource = "export { default } from 'preload-dependency';";
    fs.writeFileSync(child, childSource);
    const payload = path.join(root, 'loader-input.txt');
    fs.writeFileSync(payload, 'LOADER');
    const proof = path.join(root, 'preload-proof.json');
    const imported = path.join(root, 'preload.mjs');
    fs.writeFileSync(imported, `import value from './child.mjs'; import fs from 'node:fs';
      import { isMainThread } from 'node:worker_threads';
      if (globalThis[Symbol.for('apack.compiler.frontend')] && isMainThread)
        fs.writeFileSync(${JSON.stringify(proof)}, JSON.stringify({ value, loader: globalThis.loaderValue, origin: import.meta.url }));`);
    const loader = path.join(root, 'loader.mjs');
    fs.writeFileSync(loader, `import fs from 'node:fs';
      const value = fs.readFileSync(${JSON.stringify(payload)}, 'utf8');
      export async function load(url, context, next) {
        const result = await next(url, context);
        return url === ${JSON.stringify(pathToFileURL(imported).href)}
          ? { ...result, source: 'globalThis.loaderValue = ' + JSON.stringify(value) + ';\\n' + result.source } : result;
      }`);
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: pack });
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--import', pathToFileURL(imported).href, '--experimental-loader', loader]);
    frontend = await startPackFrontend(pack, compiler, signal);
    expect(JSON.parse(fs.readFileSync(proof, 'utf8'))).toEqual({ value: 'FIRST', loader: 'LOADER', origin: pathToFileURL(imported).href });
    expect(await frontend.isCurrent(signal)).toBe(true);
    for (const [file, original, changed] of [
      [payload, 'LOADER', 'CHANGED'],
      [child, childSource, "export default 'CHANGED';"],
      [path.join(dependency, 'first.mjs'), "export default 'FIRST';", "export default 'CHANGED';"],
      [metadata, declaration, JSON.stringify({ name: 'preload-dependency', type: 'module', exports: './second.mjs' })],
    ] as const) {
      fs.writeFileSync(file, changed);
      expect(await frontend.isCurrent(signal), file).toBe(false);
      fs.writeFileSync(file, original);
      expect(await frontend.isCurrent(signal), file).toBe(true);
    }
    const view = `http://localhost:${frontend.address.port}/src/View.vue`;
    expect(await (await fetch(view)).text()).toContain('VITE_ESM_BEFORE');
    fs.writeFileSync(path.join(pack, 'src/View.vue'), '<template>VITE_ESM_AFTER</template>');
    await vi.waitFor(async () => expect(await (await fetch(view)).text()).toContain('VITE_ESM_AFTER'), { timeout: 2_000 });
    expect(await frontend.isCurrent(signal)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
    try { await frontend?.close(); }
    finally { await compiler?.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});

it('retains independent captured Vite owners through replacement and close', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-vite-owners-')));
  const pack = path.join(root, 'pack');
  const proof = path.join(root, 'children.jsonl');
  const previous = process.env.NODE_OPTIONS;
  let compiler: CompilerInstallation | undefined;
  const frontends: PackFrontend[] = [];
  const signal = new AbortController().signal;
  try {
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>VITE_OWNED</template>' } });
    const preload = path.join(pack, 'descendant.cjs');
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')] && require('node:worker_threads').isMainThread) {
      const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'});
      child.unref();
      require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({root:process.pid, child:child.pid})+'\\n');
    }`);
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: pack });
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
    frontends.push(await startPackFrontend(pack, compiler, signal));
    frontends.push(await startPackFrontend(pack, compiler, signal));
    const children = fs.readFileSync(proof, 'utf8').trim().split('\n').map(line => JSON.parse(line)) as { root: number; child: number }[];
    expect(children.map(child => child.root)).toEqual(frontends.map(frontend => frontend.address.pid));
    await frontends[0]!.close();
    await vi.waitFor(() => expect(() => process.kill(children[0]!.child, 0)).toThrow(), { timeout: 2_000 });
    expect(frontends[1]!.alive()).toBe(true);
    expect(() => process.kill(children[1]!.child, 0)).not.toThrow();
    expect(await frontends[1]!.isCurrent(signal)).toBe(true);
    expect(await (await fetch(`http://localhost:${frontends[1]!.address.port}/src/View.vue`)).text()).toContain('VITE_OWNED');
    await frontends[1]!.close();
    await vi.waitFor(() => expect(() => process.kill(children[1]!.child, 0)).toThrow(), { timeout: 2_000 });
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
    try { await Promise.all(frontends.map(frontend => frontend.close())); }
    finally { await compiler?.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});

it.runIf(process.platform === 'darwin')('watches external Vite native changes and repairs a failed generation through newly discovered inputs', async () => {
  const fixture = nativeFixture('relative');
  const builder = createPackBuilder(fixture.pack);
  const previous = process.env.NODE_OPTIONS;
  let watcher: Awaited<ReturnType<typeof startPackBuildWatcher>> | undefined;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const addresses: { port: number; pid: number }[] = [];
  const publications = vi.fn(async () => {});
  const builds = vi.spyOn(builder, 'build');
  const current = vi.spyOn(builder, 'isFrontendCurrent');
  const proof = path.join(fixture.root, 'watch-native-proof.jsonl');
  const preload = path.join(fixture.root, 'vite-preload.cjs');
  const started = performance.now();
  const checkpoint = (phase: string) => console.info(`Native watch: ${phase} (${Math.round(performance.now() - started)}ms)`);
  try {
    packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>NATIVE_WATCH</template>',
        'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')]) { ${nativeLoad(fixture, proof)} }`);
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
    watcher = await startPackBuildWatcher(fixture.pack, { builder, buildArgs: ['--skip-fe'], onBuilt: publications,
      place: { env: 'test', userDataDir: path.join(fixture.root, 'profile') } });
    checkpoint('watch ready');
    await builder.serveFrontend(address => { if (address) addresses.push(address); });
    checkpoint('frontend ready');
    const view = `http://localhost:${addresses[0]!.port}/src/View.vue`;
    expect(await (await fetch(view, { signal: AbortSignal.timeout(2_000) })).text()).toContain('NATIVE_WATCH');
    await vi.waitFor(() => expect(current).toHaveBeenCalled(), { timeout: 2_000 });
    await current.mock.results.at(-1)!.value;
    current.mockClear();
    const touched = new Date(Date.now() + 2_000);
    fs.utimesSync(fixture.library, touched, touched);
    await vi.waitFor(() => expect(current).toHaveBeenCalled(), { timeout: 2_000 });
    expect(await current.mock.results.at(-1)!.value).toBe(true);
    expect(publications).not.toHaveBeenCalled();
    checkpoint('unchanged touch checked');

    const staging = path.join(fixture.root, 'replacement');
    const helper = path.join(staging, 'libhelper.dylib');
    const replacement = path.join(staging, 'libvalue.dylib');
    fixture.buildLibrary(helper, 'int helper_value(void) { return 22; }', '@loader_path/new/libhelper.dylib');
    fixture.buildLibrary(replacement, 'extern int helper_value(void); int native_value(void) { return helper_value(); }',
      '@loader_path/../lib/libvalue.dylib', [helper]);
    builds.mockClear();
    fs.rmSync(fixture.marker);
    fs.renameSync(replacement, fixture.library);
    await vi.waitFor(() => expect(builds).toHaveBeenCalled(), { timeout: 20_000 });
    // Wait for the detected rebuild itself, rather than timing compilation through a console spy.
    await expect(builds.mock.results[0]!.value).rejects.toThrow('Pack frontend exited before readiness');
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('Build/reload failed'));
    checkpoint('missing dependency refused');
    expect(fs.existsSync(fixture.marker)).toBe(false);
    expect(addresses).toHaveLength(1);
    expect(await (await fetch(view, { signal: AbortSignal.timeout(2_000) })).text()).toContain('NATIVE_WATCH');

    // Repair only the new dependency, outside the authored pack and the incumbent's inputs.
    const repaired = path.join(fixture.native, 'lib/new/libhelper.dylib');
    fs.mkdirSync(path.dirname(repaired), { recursive: true });
    builds.mockClear();
    fs.copyFileSync(helper, repaired);
    checkpoint('new dependency repaired');
    await vi.waitFor(() => expect(builds).toHaveBeenCalled(), { timeout: 20_000 });
    await expect(builds.mock.results[0]!.value).resolves.toBeUndefined();
    await vi.waitFor(() => expect(publications).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    checkpoint('repair published');
    expect(addresses).toHaveLength(2);
    expect(() => process.kill(addresses[0]!.pid, 0)).toThrow();
    const results = fs.readFileSync(proof, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      .filter(row => row.thread === 0).map(row => row.value);
    expect(results).toEqual([11, 22]);
  } catch (error) {
    console.info('Native watch refusals:', errors.mock.calls);
    throw error;
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
    try { await watcher?.close(); await builder.close(); }
    finally { errors.mockRestore(); fs.rmSync(fixture.root, { recursive: true, force: true }); }
  }
}, 120_000);

it.runIf(process.platform === 'darwin').each(['preload', 'thread'] as const)(
  'owns retained Vite native %s inputs while authored Vue sources stay live', async site => {
    const fixture = nativeFixture('relative');
    const refused = nativeFixture('absolute');
    const previous = process.env.NODE_OPTIONS;
    let compiler: CompilerInstallation | undefined;
    let frontend: PackFrontend | undefined;
    const signal = new AbortController().signal;
    try {
      // Put the addon inside the authored pack itself: capturing its whole package would freeze Vue.
      fs.cpSync(fixture.native, fixture.pack, { recursive: true });
      const native = { ...fixture, native: fixture.pack, library: path.join(fixture.pack, 'lib/libvalue.dylib') };
      packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
        files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>VITE_NATIVE_BEFORE</template>' } });
      const proof = path.join(fixture.root, 'vite-native-proof.jsonl');
      const preload = path.join(fixture.pack, 'vite-native.cjs');
      const load = nativeLoad(native, proof);
      const writePreload = (load: string) => fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')] && require('node:worker_threads').isMainThread) {
        ${site === 'preload' ? load : `const worker = new (require('node:worker_threads').Worker)(${JSON.stringify(load + ';setInterval(() => {}, 1000);')}, { eval: true, execArgv: [] });
        worker.on('error', error => { console.error(error); process.exit(1); });`}
      }`);
      writePreload(load);
      compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: fixture.pack });
      process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
      frontend = await startPackFrontend(fixture.pack, compiler, signal);
      await vi.waitFor(() => expect(fs.existsSync(proof)).toBe(true), { timeout: 2_000 });
      const loaded = JSON.parse(fs.readFileSync(proof, 'utf8').trim()) as { value: number; thread: number; libraries: string[] };
      expect(loaded.value).toBe(11);
      expect(loaded.thread > 0).toBe(site === 'thread');
      expect(loaded.libraries).not.toContain(native.library);
      expect(loaded.libraries.some(file => file.includes('apack-vite-') && file.endsWith('/lib/libvalue.dylib'))).toBe(true);
      expect(await frontend.isCurrent(signal)).toBe(true);
      const initializedPreload = fs.readFileSync(preload, 'utf8');
      fs.appendFileSync(preload, '\n// changed preload bytes');
      expect(await frontend.isCurrent(signal)).toBe(false);
      fs.writeFileSync(preload, initializedPreload);
      expect(await frontend.isCurrent(signal)).toBe(true);
      const view = `http://localhost:${frontend.address.port}/src/View.vue`;
      expect(await (await fetch(view)).text()).toContain('VITE_NATIVE_BEFORE');
      fs.writeFileSync(path.join(fixture.pack, 'src/View.vue'), '<template>VITE_NATIVE_AFTER</template>');
      await vi.waitFor(async () => expect(await (await fetch(view)).text()).toContain('VITE_NATIVE_AFTER'), { timeout: 2_000 });
      expect(await frontend.isCurrent(signal)).toBe(true);
      fs.writeFileSync(native.library, 'CHANGED');
      expect(await frontend.isCurrent(signal)).toBe(false);
      expect(frontend.alive()).toBe(true);
      writePreload(nativeLoad(refused, path.join(refused.root, 'refused-proof.jsonl')));
      await expect(startPackFrontend(fixture.pack, compiler, signal)).rejects.toThrow('Pack frontend exited before readiness');
      expect(fs.existsSync(refused.marker)).toBe(false);
      expect(frontend.alive()).toBe(true);
      expect(await (await fetch(view)).text()).toContain('VITE_NATIVE_AFTER');
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
      try { await frontend?.close(); }
      finally {
        await compiler?.dispose();
        for (const { root } of [fixture, refused]) fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
);

it.runIf(process.platform === 'darwin').each(['relative', 'absolute', 'transitive'] as const)('checks %s native libraries before addon initialization', async mode => {
  const { root, pack, library, marker, outside, entry } = nativeFixture(mode);
  let compilation: ReturnType<typeof captureCompilationInputs> | undefined;
  let modules: ReturnType<typeof createCompilerModuleLoader> | undefined;
  try {
    compilation = captureCompilationInputs(pack);
    modules = createCompilerModuleLoader(compilation);
    const load = () => withCompilerFileReads({ compilation: compilation! }, () => modules!.importModule(entry));
    if (mode !== 'relative') {
      const dependency = mode === 'absolute' ? library : outside;
      // Preparing a package's unused native main must not refuse its selected JavaScript export.
      const fallback = await withCompilerFileReads({ compilation }, () => modules!.importModule(path.join(pack, 'fallback.cjs')));
      expect(fallback.default).toBe('JS_FALLBACK');
      await expect(load()).rejects.toThrow(`references "${dependency}" outside its captured package`);
      await expect(load()).rejects.toThrow(`references "${dependency}" outside its captured package`);
      expect(fs.existsSync(marker)).toBe(false);
      expect((process.report.getReport() as { sharedObjects: string[] }).sharedObjects).not.toContain(dependency);
      return;
    }
    const loaded = await load();
    expect(fs.existsSync(marker)).toBe(true);
    const addon = loaded.default as { read(): number };
    expect(addon.read()).toBe(11);
    const shared = (process.report.getReport() as { sharedObjects: string[] }).sharedObjects;
    expect(shared).toContain(compilation.readTree().path(library));
    expect(shared).not.toContain(library);
    compilation.assertCurrent();
    fs.writeFileSync(`${library}.replacement`, 'CHANGED');
    fs.renameSync(`${library}.replacement`, library);
    expect(addon.read()).toBe(11);
    expect(() => compilation!.assertCurrent()).toThrow(/changed/i);
  } finally {
    try { await modules?.dispose(); }
    finally { compilation?.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});

it.runIf(process.platform === 'darwin').each(['preload', 'thread'] as const)('captures native %s libraries and retains the incumbent after outside-library refusal', async site => {
  const supported = nativeFixture('relative');
  const refused = [nativeFixture('absolute'), nativeFixture('transitive')];
  const builder = createPackBuilder(supported.pack);
  const previous = process.env.NODE_OPTIONS;
  const preload = path.join(supported.pack, 'native-preload.cjs');
  const proof = path.join(supported.root, 'preload-proof.json');
  const writeLoader = (fixture: ReturnType<typeof nativeFixture>) => {
    const load = nativeLoad(fixture, proof);
    if (site === 'preload') fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.startup')]) { ${load} }`);
    else fs.writeFileSync(path.join(supported.pack, 'src/compiler.ts'), nativeWorkerCompiler(load));
  };
  try {
    packFixture({ at: supported.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {},
      ...(site === 'thread' ? { content: { formats: { rows: { compiler: 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
        sources: { rows: { path: 'src/value.txt', format: 'rows' } } } } : {}) },
      files: { 'src/value.txt': 'input', 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    writeLoader(supported);
    if (site === 'preload') process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
    await builder.build({ args: ['--skip-fe'] });
    const results = fs.readFileSync(proof, 'utf8').trim().split('\n').map(line => JSON.parse(line)) as { thread: number; value: number; libraries: string[] }[];
    for (const result of results) {
      if (site === 'thread') expect(result.thread).toBeGreaterThan(0);
      expect(result.value).toBe(11);
      expect(result.libraries).not.toContain(supported.library);
      expect(result.libraries.some(file => file.includes('apack-inputs-') && file.endsWith('/lib/libvalue.dylib'))).toBe(true);
    }
    const inputs = readPackBuildInputs(path.join(supported.pack, 'dist'));
    assertPackBuildInputsCurrent(supported.pack, inputs);
    const original = fs.readFileSync(supported.library);
    fs.writeFileSync(supported.library, 'CHANGED');
    expect(() => assertPackBuildInputsCurrent(supported.pack, inputs)).toThrow();
    fs.writeFileSync(supported.library, original);
    assertPackBuildInputsCurrent(supported.pack, inputs);
    const revision = readPackBuild(path.join(supported.pack, 'dist')).revision;
    for (const fixture of refused) {
      fs.rmSync(proof, { force: true });
      writeLoader(fixture);
      await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow();
      expect(fs.existsSync(fixture.marker)).toBe(false);
      expect(fs.existsSync(proof)).toBe(false);
      expect(readPackBuild(path.join(supported.pack, 'dist')).revision).toBe(revision);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
    await builder.close();
    for (const fixture of [supported, ...refused]) fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

it.runIf(process.platform === 'darwin')('retains launch-time native search paths across preload changes and compiler workers', async () => {
  const fixture = nativeFixture('relative');
  const builder = createPackBuilder(fixture.pack);
  const previousOptions = process.env.NODE_OPTIONS;
  const previousSearch = process.env.DYLD_LIBRARY_PATH;
  const search = path.join(fixture.root, 'search');
  const proof = path.join(fixture.root, 'worker-proof.json');
  const preload = path.join(fixture.pack, 'clear-loader-env.cjs');
  try {
    fs.mkdirSync(search);
    packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {},
      content: { formats: { rows: { compiler: 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
        sources: { rows: { path: 'src/value.txt', format: 'rows' } } } },
      files: { 'src/compiler.ts': nativeWorkerCompiler(nativeLoad(fixture, proof)), 'src/value.txt': 'input',
        'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    fs.writeFileSync(preload, `delete process.env.DYLD_LIBRARY_PATH;`);
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
    process.env.DYLD_LIBRARY_PATH = search;
    await builder.build({ args: ['--skip-fe'] });
    const loaded = JSON.parse(fs.readFileSync(proof, 'utf8')) as { value: number; thread: number; libraries: string[] };
    expect(loaded.thread).toBeGreaterThan(0);
    expect(loaded.value).toBe(11);
    expect(loaded.libraries).not.toContain(fixture.library);
    const output = path.join(fixture.pack, 'dist');
    const revision = readPackBuild(output).revision;
    const inputs = readPackBuildInputs(output);
    assertPackBuildInputsCurrent(fixture.pack, inputs);
    fs.rmSync(fixture.marker);
    fs.rmSync(proof);
    // An unused directory was harmless; this new matching library would now override the owned copy.
    fs.copyFileSync(fixture.library, path.join(search, path.basename(fixture.library)));
    expect(() => assertPackBuildInputsCurrent(fixture.pack, inputs)).toThrow();
    await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow();
    expect(fs.existsSync(fixture.marker)).toBe(false);
    expect(fs.existsSync(proof)).toBe(false);
    expect(readPackBuild(output).revision).toBe(revision);
  } finally {
    if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousOptions;
    if (previousSearch === undefined) delete process.env.DYLD_LIBRARY_PATH;
    else process.env.DYLD_LIBRARY_PATH = previousSearch;
    await builder.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

it.runIf(process.platform === 'darwin')('admits OS libraries and refuses outside launch overrides before build or frontend launch', async () => {
  const fixture = nativeFixture('relative');
  const builder = createPackBuilder(fixture.pack);
  const previous = process.env.DYLD_INSERT_LIBRARIES;
  const previousCache = process.env.DYLD_SHARED_CACHE_DIR;
  const marker = path.join(fixture.root, 'inserted');
  const outside = path.join(fixture.root, 'insert/libinit.dylib');
  let compiler: CompilerInstallation | undefined;
  try {
    fixture.buildLibrary(outside, `#include <stdio.h>
__attribute__((constructor)) static void initialize(void) {
  FILE *marker = fopen(${JSON.stringify(marker)}, "w"); if (marker) fclose(marker);
}`, outside);
    packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    process.env.DYLD_INSERT_LIBRARIES = '/usr/lib/libSystem.B.dylib';
    await builder.build({ args: ['--skip-fe'] });
    const output = path.join(fixture.pack, 'dist');
    const revision = readPackBuild(output).revision;
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: fixture.pack });
    for (const library of [outside, fixture.library]) {
      process.env.DYLD_INSERT_LIBRARIES = library;
      await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow('DYLD_INSERT_LIBRARIES');
      await expect(startPackFrontend(fixture.pack, compiler, new AbortController().signal)).rejects.toThrow('DYLD_INSERT_LIBRARIES');
      expect(fs.existsSync(marker)).toBe(false);
      expect(readPackBuild(output).revision).toBe(revision);
    }
    process.env.DYLD_INSERT_LIBRARIES = '/usr/lib/libSystem.B.dylib';
    process.env.DYLD_SHARED_CACHE_DIR = fixture.root;
    await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow('DYLD_SHARED_CACHE_DIR');
    await expect(startPackFrontend(fixture.pack, compiler, new AbortController().signal)).rejects.toThrow('DYLD_SHARED_CACHE_DIR');
    expect(fs.existsSync(marker)).toBe(false);
    expect(readPackBuild(output).revision).toBe(revision);
  } finally {
    if (previous === undefined) delete process.env.DYLD_INSERT_LIBRARIES;
    else process.env.DYLD_INSERT_LIBRARIES = previous;
    if (previousCache === undefined) delete process.env.DYLD_SHARED_CACHE_DIR;
    else process.env.DYLD_SHARED_CACHE_DIR = previousCache;
    await builder.close();
    await compiler?.dispose();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

it.runIf(process.platform === 'darwin').each(['DYLD_FALLBACK_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH', 'DYLD_FALLBACK_FRAMEWORK_PATH'] as const)(
  'refuses external %s before native initialization after preload mutation', async variable => {
    const framework = variable !== 'DYLD_FALLBACK_LIBRARY_PATH';
    const fixture = nativeFixture(framework ? 'framework' : 'fallback');
    const builder = createPackBuilder(fixture.pack);
    const previousOptions = process.env.NODE_OPTIONS;
    const previousSearch = process.env[variable];
    const preload = path.join(fixture.pack, 'clear-fallback.cjs');
    const attempted = path.join(fixture.root, 'owned-attempt');
    const search = framework ? path.join(fixture.root, 'outside') : path.dirname(fixture.library);
    const selected = framework ? path.join(search, path.relative(fixture.native, fixture.library)) : fixture.library;
    try {
      if (framework) {
        fs.mkdirSync(path.dirname(selected), { recursive: true });
        fs.copyFileSync(fixture.library, selected);
        if (variable === 'DYLD_FALLBACK_FRAMEWORK_PATH') fs.rmSync(fixture.library);
      }
      // First prove dyld really selects the external bytes in a fresh process.
      const loaded = JSON.parse(execFileSync(process.execPath, ['-e', `const value = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))}).read(); console.log(JSON.stringify({ value, libraries: process.report.getReport().sharedObjects }));`], {
        encoding: 'utf8', env: { ...process.env, [variable]: search },
      })) as { value: number; libraries: string[] };
      expect(loaded.value).toBe(11);
      expect(loaded.libraries).toContain(fs.realpathSync.native(selected));
      expect(fs.existsSync(fixture.marker)).toBe(true);
      fs.rmSync(fixture.marker);
      packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
        files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
      await builder.build({ args: ['--skip-fe'] });
      const output = path.join(fixture.pack, 'dist');
      const revision = readPackBuild(output).revision;
      fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.startup')]) {
        delete process.env[${JSON.stringify(variable)}];
        require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'owned');
        require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))});
      }`);
      process.env[variable] = search;
      process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
      await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow();
      expect(fs.readFileSync(attempted, 'utf8')).toBe('owned');
      expect(fs.existsSync(fixture.marker)).toBe(false);
      expect(readPackBuild(output).revision).toBe(revision);
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
      if (previousSearch === undefined) delete process.env[variable];
      else process.env[variable] = previousSearch;
      await builder.close();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  },
);

it.runIf(process.platform === 'darwin').each(['DYLD_VERSIONED_LIBRARY_PATH', 'DYLD_VERSIONED_FRAMEWORK_PATH'] as const)(
  'refuses selected external %s libraries before retained frontend initialization', async variable => {
    const fixture = nativeFixture('relative');
    const previousOptions = process.env.NODE_OPTIONS;
    const previousSearch = process.env[variable];
    let compiler: CompilerInstallation | undefined;
    let frontend: PackFrontend | undefined;
    try {
      const directory = path.join(fixture.root, 'overrides');
      const selected = path.join(directory, variable === 'DYLD_VERSIONED_FRAMEWORK_PATH' ? 'Value.framework/Value' : 'liboverride.dylib');
      fixture.buildLibrary(selected, 'int native_value(void) { return 22; }', '@loader_path/../lib/libvalue.dylib');
      const addon = path.join(fixture.native, 'binding/addon.node');
      const loaded = JSON.parse(execFileSync(process.execPath, ['-e', `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects }));`], {
        encoding: 'utf8', env: { ...process.env, [variable]: directory },
      })) as { value: number; libraries: string[] };
      expect(loaded.value).toBe(22);
      expect(loaded.libraries).toContain(selected);
      fs.rmSync(fixture.marker);
      packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
        files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>VERSIONED</template>' } });
      const preload = path.join(fixture.root, 'versioned-preload.cjs');
      fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')]) {
        delete process.env[${JSON.stringify(variable)}]; require(${JSON.stringify(addon)});
      }`);
      compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: fixture.pack });
      process.env[variable] = directory;
      process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
      await expect(startPackFrontend(fixture.pack, compiler, new AbortController().signal)
        .then(value => { frontend = value; })).rejects.toThrow(`${variable} references directory "${directory}"`);
      expect(fs.existsSync(fixture.marker)).toBe(false);
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
      if (previousSearch === undefined) delete process.env[variable];
      else process.env[variable] = previousSearch;
      try { await frontend?.close(); }
      finally { await compiler?.dispose(); fs.rmSync(fixture.root, { recursive: true, force: true }); }
    }
  },
);

it.runIf(process.platform === 'darwin')('captures the selected native image suffix and refuses its later transitive escape', async () => {
  const fixture = nativeFixture('relative');
  const builder = createPackBuilder(fixture.pack);
  const previousOptions = process.env.NODE_OPTIONS;
  const previousSuffix = process.env.DYLD_IMAGE_SUFFIX;
  const selected = fixture.library.replace(/\.dylib$/, '_apack.dylib');
  const reference = '@loader_path/../lib/libvalue.dylib';
  const preload = path.join(fixture.pack, 'suffix-preload.cjs');
  const proof = path.join(fixture.root, 'selected.json');
  const attempted = path.join(fixture.root, 'owned-attempt');
  try {
    fixture.buildLibrary(selected, 'int native_value(void) { return 37; }', reference);
    const loaded = JSON.parse(execFileSync(process.execPath, ['-e', `const addon = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))}); console.log(JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects }));`], {
      encoding: 'utf8', env: { ...process.env, DYLD_IMAGE_SUFFIX: '_apack' },
    })) as { value: number; libraries: string[] };
    expect(loaded.value).toBe(37);
    expect(loaded.libraries).toContain(selected);
    fs.rmSync(fixture.marker);
    packFixture({ at: fixture.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.startup')]) {
      delete process.env.DYLD_IMAGE_SUFFIX;
      require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'owned');
      ${nativeLoad(fixture, proof)}
    }`);
    process.env.DYLD_IMAGE_SUFFIX = '_apack';
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
    await builder.build({ args: ['--skip-fe'] });
    const accepted = JSON.parse(fs.readFileSync(proof, 'utf8')) as { value: number; libraries: string[] };
    expect(accepted.value).toBe(37);
    expect(accepted.libraries).not.toContain(selected);
    expect(accepted.libraries.some(file => file.includes('apack-inputs-') && file.endsWith('/lib/libvalue_apack.dylib'))).toBe(true);
    const output = path.join(fixture.pack, 'dist');
    const revision = readPackBuild(output).revision;
    const inputs = readPackBuildInputs(output);
    assertPackBuildInputsCurrent(fixture.pack, inputs);
    fs.rmSync(fixture.marker);
    fs.rmSync(proof);
    fs.rmSync(attempted);
    fixture.buildLibrary(fixture.outside, 'int outside_value(void) { return 37; }', fixture.outside);
    fixture.buildLibrary(selected, 'extern int outside_value(void); int native_value(void) { return outside_value(); }', reference, [fixture.outside]);
    expect(() => assertPackBuildInputsCurrent(fixture.pack, inputs)).toThrow();
    await expect(builder.build({ args: ['--skip-fe'] })).rejects.toThrow();
    expect(fs.readFileSync(attempted, 'utf8')).toBe('owned');
    expect(fs.existsSync(fixture.marker)).toBe(false);
    expect(fs.existsSync(proof)).toBe(false);
    expect(readPackBuild(output).revision).toBe(revision);
  } finally {
    if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousOptions;
    if (previousSuffix === undefined) delete process.env.DYLD_IMAGE_SUFFIX;
    else process.env.DYLD_IMAGE_SUFFIX = previousSuffix;
    await builder.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
