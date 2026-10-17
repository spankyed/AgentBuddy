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

function nativeFixture(mode: 'relative' | 'absolute' | 'transitive') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-libraries-')));
  try {
    const pack = path.join(root, 'pack');
    const native = path.join(root, 'native-package');
    const library = path.join(native, 'lib/libvalue.dylib');
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
    mode === 'absolute' ? library : '@loader_path/../lib/libvalue.dylib', mode === 'transitive' ? [outside] : []);
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
      '-o', path.join(native, 'binding/addon.node')]);
    fs.writeFileSync(path.join(pack, 'package.json'), '{"type":"commonjs"}');
    fs.writeFileSync(path.join(pack, 'tsconfig.json'), '{"compilerOptions":{"noLib":true,"types":[]}}');
    if (mode !== 'relative') {
      fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: 'native-fixture', version: '1.0.0', main: 'binding/addon.node', exports: './fallback.cjs' }));
      fs.writeFileSync(path.join(native, 'fallback.cjs'), 'module.exports = "JS_FALLBACK";');
      fs.mkdirSync(path.join(pack, 'node_modules'));
      fs.symlinkSync(native, path.join(pack, 'node_modules/native-fixture'), 'dir');
      fs.writeFileSync(path.join(pack, 'fallback.cjs'), 'module.exports = require("native-fixture");');
    }
    const entry = path.join(pack, 'compiler.cjs');
    // Extensionless file resolution must capture the selected native image's package too.
    fs.writeFileSync(entry, "module.exports = require('../native-package/binding/addon');");
    return { root, pack, native, library, marker, outside, entry };
  } catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error; }
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

it.runIf(process.platform === 'darwin')('captures native preload libraries and retains the incumbent after outside-library refusal', async () => {
  const supported = nativeFixture('relative');
  const refused = [nativeFixture('absolute'), nativeFixture('transitive')];
  const builder = createPackBuilder(supported.pack);
  const previous = process.env.NODE_OPTIONS;
  const preload = path.join(supported.pack, 'native-preload.cjs');
  const proof = path.join(supported.root, 'preload-proof.json');
  const writePreload = (fixture: ReturnType<typeof nativeFixture>) => fs.writeFileSync(preload,
    `if (globalThis[Symbol.for('apack.compiler.startup')]) {
const addon = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))});
require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects }) + '\\n');
}`);
  try {
    packFixture({ at: supported.pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
    writePreload(supported);
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
    await builder.build({ args: ['--skip-fe'] });
    const results = fs.readFileSync(proof, 'utf8').trim().split('\n').map(line => JSON.parse(line)) as { value: number; libraries: string[] }[];
    for (const result of results) {
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
      writePreload(fixture);
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
