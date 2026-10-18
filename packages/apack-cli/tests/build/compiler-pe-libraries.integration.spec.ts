import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { formatNodeOptions, parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from '../../src/build/compiler-installation.ts';
import { startPackFrontend, type PackFrontend } from '../../src/build/frontend-process.ts';
import { nativeAddonSource } from '../_support/native-addon.ts';
import { parsePeLibraryMetadata } from '../../src/build/compiler-pe-libraries.ts';

it.runIf(process.platform === 'win32')('owns retained PE libraries and refuses outside DLLs before initialization', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pe-libraries-')));
  const pack = path.join(root, 'pack');
  const previousOptions = process.env.NODE_OPTIONS;
  const pathKey = Object.keys(process.env).sort().find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  const previousPath = process.env[pathKey];
  let compiler: CompilerInstallation | undefined;
  let frontend: PackFrontend | undefined;
  let candidate: PackFrontend | undefined;
  const signal = new AbortController().signal;
  const normalize = (file: string) => fs.realpathSync.native(file).toLowerCase();
  const compile = (args: string[]) => execFileSync('cl.exe', ['/nologo', '/MT', ...args], { cwd: root, timeout: 15_000 });
  try {
    const headers = process.env.APACK_TEST_NODE_HEADERS;
    const importLibrary = process.env.APACK_TEST_NODE_IMPORT_LIBRARY;
    expect(headers, 'run the disposable Windows native SDK setup').toBeTruthy();
    expect(importLibrary).toBeTruthy();
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>PE_BEFORE</template>' } });
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
        '/OUT:' + file, '/IMPLIB:' + path.join(root, 'value.lib')]);
    };
    buildLibrary(library, 11);
    const source = path.join(root, 'addon.c');
    fs.writeFileSync(source, nativeAddonSource(addonMarker));
    compile(['/LD', '/I' + headers!, source, '/Fo' + path.join(root, 'addon.obj'), '/link', '/INCREMENTAL:NO',
      '/OUT:' + addon, path.join(root, 'value.lib'), importLibrary!]);
    const metadata = parsePeLibraryMetadata(fs.readFileSync(addon));
    expect(metadata.machine).toBe(0x8664);
    expect(metadata.imports.map(imported => imported.name.toLowerCase())).toContain('apack_value.dll');
    expect(metadata.exports.some(exported => exported.names.includes('napi_register_module_v1'))).toBe(true);
    expect(parsePeLibraryMetadata(fs.readFileSync(library)).exports.some(exported => exported.names.includes('native_value'))).toBe(true);
    const observe = () => JSON.parse(execFileSync(process.execPath, ['-e',
      `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({value:addon.read(),libraries:process.report.getReport().sharedObjects}));`],
    { encoding: 'utf8', timeout: 10_000 })) as { value: number; libraries: string[] };
    const ordinary = observe();
    expect(ordinary.value).toBe(11);
    expect(ordinary.libraries.map(normalize)).toContain(normalize(library));
    expect(fs.existsSync(dllMarker)).toBe(true);
    expect(fs.existsSync(addonMarker)).toBe(true);
    fs.rmSync(dllMarker); fs.rmSync(addonMarker);
    const proof = path.join(root, 'loaded.json');
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')] && require('node:worker_threads').isMainThread) {
      const addon = require(${JSON.stringify(addon)});
      require('node:fs').writeFileSync(${JSON.stringify(proof)}, JSON.stringify({value:addon.read(),libraries:process.report.getReport().sharedObjects}));
    }`);
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: pack });
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
    frontend = await startPackFrontend(pack, compiler, signal);
    const loaded = JSON.parse(fs.readFileSync(proof, 'utf8')) as { value: number; libraries: string[] };
    expect(loaded.value).toBe(11);
    expect(loaded.libraries.map(normalize)).not.toContain(normalize(library));
    expect(loaded.libraries.map(normalize).some(file => file.includes('apack-vite-')
      && file.endsWith(path.join('binding', 'apack_value.dll')))).toBe(true);
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
