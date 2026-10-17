import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
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
import { startPackFrontend } from '../../src/build/frontend-process.ts';
import { assertCapturedMachOLibraries, captureMachOLibraryEnvironment } from '../../src/build/compiler-native-libraries.ts';

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

it.runIf(process.platform === 'darwin')('admits OS insertion and refuses live library constructors before build or frontend launch', async () => {
  const fixture = nativeFixture('relative');
  const builder = createPackBuilder(fixture.pack);
  const previous = process.env.DYLD_INSERT_LIBRARIES;
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
  } finally {
    if (previous === undefined) delete process.env.DYLD_INSERT_LIBRARIES;
    else process.env.DYLD_INSERT_LIBRARIES = previous;
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
