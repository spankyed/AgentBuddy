import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { expect, it, onTestFinished, vi } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackBuild } from '@apackdev/host/packs';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';
import { createPackBuilder } from '../../src/build/build-process.ts';
import { createCompilerFileView, relativeCompilerPath } from '@apackdev/host/build/compiler-inputs';
import { formatNodeOptions, parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from '../../src/build/compiler-installation.ts';
import { startPackFrontend, type PackFrontend } from '../../src/build/frontend-process.ts';
import { nativeAddonSource } from '../_support/native-addon.ts';
import { parsePeLibraryMetadata } from '../../src/build/compiler-pe-libraries.ts';
import { assertCapturedPeLibraries } from '../../src/build/compiler-pe-admission.ts';
import { BUILD_INPUTS_DIRECTORY_ENV } from '../../src/build/compiler-read-tree.ts';
import type { CapturedNativeModule } from '../../src/build/compiler-native-input-owner.ts';
import { readPeLoaderMetadata, capturePeLibraryEnvironment } from '../../src/build/compiler-pe-environment.ts';
import { readPeActivationContext } from '../../src/build/compiler-pe-activation.ts';
import { pePath } from '../../src/build/compiler-pe-paths.ts';
import { readCompilerRuntimeInputs } from '../../src/build/compiler-runtime.ts';
import { compilerStartupOptions, COMPILER_NODE_OPTIONS_ENV } from '../../src/build/compiler-startup-options.ts';
import { COMPILER_INPUTS_ENV } from '../../src/build/compiler-installation-inputs.ts';
import { spawnCompilerWorker } from '../../src/build/compiler-process.ts';

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
  const buildLibrary = (file: string, value: number, { manifest, symbol = 'native_value' }: { manifest?: string; symbol?: string } = {}) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const source = file + '.c';
    fs.writeFileSync(source, `#include <windows.h>
__declspec(dllexport) int ${symbol}(void) { return ${value}; }
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID reserved) {
  if (reason == DLL_PROCESS_ATTACH) {
    HANDLE marker = CreateFileW(L${JSON.stringify(dllMarker)}, GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (marker != INVALID_HANDLE_VALUE) CloseHandle(marker);
  }
  return TRUE;
}`);
    compile(['/LD', source, '/Fo' + path.join(root, 'value.obj'), '/link', '/INCREMENTAL:NO',
      ...(manifest ? ['/MANIFEST:EMBED,ID=1', '/MANIFESTUAC:NO', '/MANIFESTINPUT:' + manifest] : []),
      ...(bound ? ['/DYNAMICBASE:NO', '/FIXED'] : []),
      '/OUT:' + file, '/IMPLIB:' + path.join(root, 'value.lib')]);
  };
  buildLibrary(library, 11);
  const source = path.join(root, 'addon.c');
  fs.writeFileSync(source, nativeAddonSource(addonMarker));
  const buildAddon = (manifest?: string, hostLink: readonly string[] = []) => compile([
    '/LD', '/I' + headers!, source, '/Fo' + path.join(root, 'addon.obj'), '/link', '/INCREMENTAL:NO',
    ...(manifest ? ['/MANIFEST:EMBED,ID=2', '/MANIFESTUAC:NO', '/MANIFESTINPUT:' + manifest] : []),
    '/OUT:' + addon, path.join(root, 'value.lib'), importLibrary!, ...hostLink]);
  buildAddon();
  return { library, addon, dllMarker, addonMarker, buildLibrary, buildAddon };
}

/** Change only a private copy: DotLocal is suppressed by Node's embedded application manifest. */
function createNodeWithoutApplicationManifest(root: string) {
  const executable = path.join(root, 'node.exe');
  fs.copyFileSync(process.execPath, executable);
  const manifests = parsePeLibraryMetadata(fs.readFileSync(executable)).manifests.filter(item => item.path[1] === 1);
  expect(manifests.length).toBeGreaterThan(0);
  const source = path.join(root, 'remove-manifest.c'), tool = path.join(root, 'remove-manifest.exe');
  fs.writeFileSync(source, `#include <windows.h>
#include <stdlib.h>
int wmain(int argc, wchar_t **argv) {
  if (argc < 3) return 2;
  HANDLE update = BeginUpdateResourceW(argv[1], FALSE);
  if (!update) return 3;
  for (int i = 2; i < argc; i++) {
    if (!UpdateResourceW(update, MAKEINTRESOURCEW(24), MAKEINTRESOURCEW(1), (WORD)wcstoul(argv[i], NULL, 10), NULL, 0)) {
      EndUpdateResourceW(update, TRUE); return 4;
    }
  }
  return EndUpdateResourceW(update, FALSE) ? 0 : 5;
}`);
  execFileSync('cl.exe', ['/nologo', '/MT', source, '/Fo' + path.join(root, 'remove-manifest.obj'),
    '/link', '/OUT:' + tool], { cwd: root, timeout: 15_000 });
  for (const manifest of manifests) expect(typeof manifest.path[2]).toBe('number');
  execFileSync(tool, [executable, ...manifests.map(manifest => String(manifest.path[2]))], { timeout: 5_000 });
  expect(parsePeLibraryMetadata(fs.readFileSync(executable)).manifests.filter(item => item.path[1] === 1)).toEqual([]);
  return executable;
}

function copyPeRuntimeFixture(executable: string, destination: string, electron = false) {
  const inputs = readCompilerRuntimeInputs(executable, electron, (file, bytes) => {
    const target = path.join(destination, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  });
  for (const directory of inputs.directories) fs.mkdirSync(path.join(destination, path.relative(inputs.directory, directory)), { recursive: true });
  const copied = path.join(destination, path.relative(inputs.directory, executable));
  expect(readCompilerRuntimeInputs(copied, electron).hash).toBe(inputs.hash);
  return copied;
}

it.runIf(process.platform === 'win32')('refuses Node .local overrides through the captured compiler runtime before initialization', async ({ onTestFinished }) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-node-local-')));
  let completed = false;
  try {
    const pack = path.join(root, 'pack'), runtime = path.join(root, 'runtime');
    fs.mkdirSync(runtime);
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>LOCAL</template>' } });
    const { addon, dllMarker, addonMarker, buildLibrary } = createPeNativeFixture(root, pack);
    const executable = createNodeWithoutApplicationManifest(runtime);
    const library = path.join(runtime, 'apack_value.dll');
    buildLibrary(library, 22);
    fs.writeFileSync(executable + '.local', '');
    // Removing the manifest also removes Windows-version declarations; the runner is supported Windows.
    const environment = { ...process.env, NODE_SKIP_PLATFORM_CHECK: '1' };
    const ordinary = JSON.parse(execFileSync(executable, ['-e',
      `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({ value:addon.read(), file:addon.libraryPath() }));`],
    { cwd: pack, env: environment, encoding: 'utf8', timeout: 5_000 })) as { value: number; file: string };
    expect(ordinary.value).toBe(22);
    expect(fs.realpathSync.native(ordinary.file).toLowerCase()).toBe(fs.realpathSync.native(library).toLowerCase());
    expect(fs.existsSync(dllMarker)).toBe(true);
    expect(fs.existsSync(addonMarker)).toBe(true);
    fs.rmSync(dllMarker); fs.rmSync(addonMarker);
    const preload = path.join(root, 'preload.cjs'), proof = path.join(root, 'captured.json');
    fs.writeFileSync(preload, `if (process.env.APACK_BUILD_WORKER === '1') {
      const fs = require('node:fs'), path = require('node:path');
      const library = path.join(path.dirname(process.execPath), 'apack_value.dll');
      fs.writeFileSync(${JSON.stringify(proof)}, JSON.stringify({executable:process.execPath, library,
        marker:fs.existsSync(process.execPath + '.local'), copied:fs.statSync(library).isFile()}));
      require(${JSON.stringify(addon)});
    }`);
    const cli = path.join(compilerPackageDirectory(), 'dist/cli.js');
    const stop = new AbortController();
    const request = promisify(execFile)(executable, [cli, 'pack', 'build'], {
      cwd: pack, env: { ...environment, NODE_OPTIONS: formatNodeOptions(['--require', preload]) },
      encoding: 'utf8', signal: stop.signal, maxBuffer: 1024 * 1024,
    });
    const closed = new Promise<void>(resolve => request.child.once('close', () => resolve()));
    onTestFinished(async () => { stop.abort(); await closed; });
    const result = await request.then(output => ({ code: 0, stderr: output.stderr }), error => ({ code: error.code, stderr: String(error.stderr) }));
    expect(result.code).toBe(1);
    const captured = JSON.parse(fs.readFileSync(proof, 'utf8')) as {
      library: string; executable: string; marker: boolean; copied: boolean;
    };
    expect(captured.executable).not.toBe(executable);
    expect(captured.marker).toBe(true);
    expect(captured.copied).toBe(true);
    expect(result.stderr).toContain(`selects "${library}" outside its captured package`);
    expect(fs.existsSync(dllMarker)).toBe(false);
    expect(fs.existsSync(addonMarker)).toBe(false);
    completed = true;
  } finally {
    if (completed) fs.rmSync(root, { recursive: true, force: true });
    else console.error(`Retained Node .local runtime: ${root}`);
  }
}, 120_000);

it.runIf(process.platform === 'win32').each([
  ['Node', 'application'],
  ['Node', 'module'],
  ['Electron', 'module'],
] as const)('preserves %s %s-context assembly selection and refuses it through compiler startup before initialization', async (runtimeName, kind) => {
  const electron = runtimeName === 'Electron';
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `apack-${runtimeName.toLowerCase()}-assembly-`)));
  let completed = false;
  try {
    const pack = path.join(root, 'pack'), runtime = path.join(root, 'runtime'), copied = path.join(root, 'copied');
    fs.mkdirSync(runtime);
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} } });
    const { addon, dllMarker, addonMarker, buildLibrary, buildAddon } = createPeNativeFixture(root, pack);
    const executable = electron ? createRequire(import.meta.url)('electron') as string : createNodeWithoutApplicationManifest(runtime);
    const runtimeSource = electron ? path.dirname(executable) : runtime;
    const library = path.join(kind === 'application' ? runtime : path.join(path.dirname(addon), 'alternate'), 'apack.fixture.value/apack_value.dll');
    const outsideLibrary = kind === 'application' ? library : path.join(root, 'outside/apack_outside.dll');
    buildLibrary(library, 22);
    const identity = '<assemblyIdentity type="win32" name="apack.fixture.value" version="1.0.0.0" processorArchitecture="amd64"/>';
    fs.writeFileSync(path.join(path.dirname(library), 'apack.fixture.value.manifest'),
      `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">${identity}<file name="apack_value.dll"/></assembly>`);
    const ownerIdentity = `<assemblyIdentity type="win32" name="apack.fixture.${kind}" version="1.0.0.0" processorArchitecture="amd64"/>`;
    const manifest = `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">${ownerIdentity}<dependency><dependentAssembly>${identity}</dependentAssembly></dependency></assembly>`;
    if (kind === 'application') fs.writeFileSync(executable + '.manifest', manifest);
    else {
      const manifestFile = path.join(root, 'addon.manifest');
      fs.writeFileSync(manifestFile, manifest);
      const hostLink: string[] = [];
      if (electron) {
        const hook = path.join(root, 'host-hook.obj');
        execFileSync('cl.exe', ['/nologo', '/MT', '/c', path.join(REPO_ROOT, 'node_modules/node-gyp/src/win_delay_load_hook.cc'),
          '/DHOST_BINARY="node.exe"', '/Fo' + hook], { cwd: root, timeout: 15_000 });
        hostLink.push(hook, 'delayimp.lib', '/DELAYLOAD:node.exe');
      }
      buildAddon(manifestFile, hostLink);
      buildLibrary(outsideLibrary, 22, { symbol: 'outside_value' });
      const dependencySource = path.join(root, 'dependency.c');
      fs.writeFileSync(dependencySource, '__declspec(dllimport) int outside_value(void); __declspec(dllexport) int native_value(void) { return outside_value(); }');
      execFileSync('cl.exe', ['/nologo', '/MT', '/LD', dependencySource, '/Fo' + path.join(root, 'dependency.obj'),
        '/link', '/INCREMENTAL:NO', '/OUT:' + library, path.join(root, 'value.lib')], { cwd: root, timeout: 15_000 });
      // Successful captured startup must retain this selector, not just the DLL it selects.
      fs.writeFileSync(addon + '.2.config', `<?xml version="1.0"?><configuration><windows><assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">${ownerIdentity}<probing privatePath="alternate"/></assemblyBinding></windows></configuration>`);
    }
    const copiedExecutable = copyPeRuntimeFixture(executable, copied, electron);
    // The private manifest-less Node retains the existing supported-runner platform-check override.
    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '',
      ...(electron ? { ELECTRON_RUN_AS_NODE: '1' } : { NODE_SKIP_PLATFORM_CHECK: '1' }) };
    if (kind === 'module') {
      const key = Object.keys(environment).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
      environment[key] = path.dirname(outsideLibrary) + ';' + (environment[key] ?? '');
    }
    const ordinary = JSON.parse(execFileSync(copiedExecutable, ['-e',
      `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({value:addon.read(),file:addon.libraryPath(),electron:process.versions.electron ?? null}));`],
    { cwd: pack, env: environment, encoding: 'utf8', timeout: 5_000 })) as { value: number; file: string; electron: string | null };
    expect(ordinary.electron).toBe(electron ? createRequire(import.meta.url)('electron/package.json').version : null);
    const copiedLibrary = kind === 'application' ? path.join(copied, path.relative(runtime, library)) : library;
    expect(ordinary.value).toBe(22);
    expect(pePath(fs.realpathSync.native(ordinary.file)).toLowerCase())
      .toBe(pePath(fs.realpathSync.native(copiedLibrary)).toLowerCase());
    expect(fs.existsSync(dllMarker)).toBe(true);
    expect(fs.existsSync(addonMarker)).toBe(true);
    fs.rmSync(dllMarker); fs.rmSync(addonMarker);
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(preload, `require(${JSON.stringify(addon)});`);
    const options = compilerStartupOptions(path.join(compilerPackageDirectory(), 'bin/apack.mjs'), formatNodeOptions(['--require', preload]));
    const runStartup = async (workspace: string, source: string) => {
      fs.mkdirSync(workspace);
      const inputsFile = path.join(workspace, 'compiler-inputs.json'), entry = path.join(workspace, 'entry.cjs');
      fs.writeFileSync(inputsFile, JSON.stringify({ hash: '0'.repeat(64), packages: [compilerPackageDirectory()],
        paths: [{ captured: copied, source: runtimeSource }] }));
      fs.writeFileSync(entry, source);
      const child = spawnCompilerWorker({ executable: copiedExecutable, runtimeDirectory: copied,
        bin: path.join(compilerPackageDirectory(), 'bin/apack.mjs') }, [entry], { cwd: pack, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        env: { ...environment, APACK_BUILD_WORKER: '1', [COMPILER_INPUTS_ENV]: inputsFile,
          [BUILD_INPUTS_DIRECTORY_ENV]: workspace, [COMPILER_NODE_OPTIONS_ENV]: options.user, NODE_OPTIONS: options.worker } }, workspace);
      let errors = '', result: unknown;
      child.stderr!.on('data', chunk => { errors += chunk; });
      child.on('message', message => { result = message; });
      const closed = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject); child.once('close', resolve);
      });
      onTestFinished(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await closed; });
      const code = await closed;
      return { code, errors, result };
    };
    const refused = await runStartup(path.join(root, 'inputs'), "throw new Error('Refused preload reached the compiler entry');");
    expect(refused.code, refused.errors).toBe(1);
    expect(refused.errors).toContain(`selects "${outsideLibrary}" outside its captured package`);
    expect(refused.errors).not.toContain('Refused preload reached the compiler entry');
    expect(fs.existsSync(dllMarker)).toBe(false);
    expect(fs.existsSync(addonMarker)).toBe(false);
    if (kind === 'module') {
      fs.renameSync(outsideLibrary, path.join(path.dirname(addon), 'apack_outside.dll'));
      const workspace = path.join(root, 'allowed-inputs');
      const allowed = await runStartup(workspace, `const addon = require(${JSON.stringify(addon)});
        process.send({value:addon.read(), library:addon.libraryPath()}, () => process.exit(0));`);
      expect(allowed.code, allowed.errors).toBe(0);
      expect(allowed.result).toMatchObject({ value: 22, library: expect.any(String) });
      const file = (allowed.result as { library: string }).library;
      const capturedFile = pePath(fs.realpathSync.native(file)).toLowerCase();
      const capturedRoot = pePath(fs.realpathSync.native(workspace)).toLowerCase() + path.sep;
      expect(capturedFile.startsWith(capturedRoot)).toBe(true);
      expect(fs.existsSync(dllMarker)).toBe(true);
      expect(fs.existsSync(addonMarker)).toBe(true);
    }
    completed = true;
  } finally {
    if (completed) fs.rmSync(root, { recursive: true, force: true });
    else console.error(`Retained ${runtimeName} assembly startup: ${root}`);
  }
});

// Ordinary Windows loader controls: these deliberately bypass compiler admission. A failed
// control invalidates the fixture; it does not establish a production admission defect.
it.runIf(process.platform === 'win32').each(['local', 'assembly', 'assembly-resource', 'image-assembly', 'image-assembly-api'] as const)(
  'identifies ordinary PE %s redirection while loading a native image', kind => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pe-redirection-')));
    let completed = false;
    try {
      const pack = path.join(root, 'pack');
      fs.mkdirSync(pack);
      const { library, dllMarker, buildLibrary } = createPeNativeFixture(root, pack);
      // Admission resolves named dependencies of an explicitly loaded image.
      const entry = path.join(path.dirname(library), 'bridge.dll');
      const bridge = path.join(root, 'bridge.c');
      fs.writeFileSync(bridge, `#include <windows.h>
__declspec(dllimport) int native_value(void);
__declspec(dllexport) int probe_value(void) { return native_value(); }
__declspec(dllexport) HMODULE probe_library(void) {
  HMODULE module = NULL;
  return GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    (LPCWSTR)&native_value, &module) ? module : NULL;
}`);
      execFileSync('cl.exe', ['/nologo', '/MT', '/LD', bridge, '/Fo' + path.join(root, 'bridge.obj'), '/link',
        '/INCREMENTAL:NO', '/OUT:' + entry, path.join(root, 'value.lib')], { cwd: root, timeout: 15_000 });
      expect(parsePeLibraryMetadata(fs.readFileSync(entry)).imports.map(imported => imported.name)).toContain('apack_value.dll');
      const runtime = path.join(root, 'runtime');
      fs.mkdirSync(runtime);
      const executable = path.join(runtime, 'probe.exe');
      const source = path.join(root, 'probe.c');
      fs.writeFileSync(source, `#include <windows.h>
#include <stdio.h>
int wmain(int argc, wchar_t **argv) {
  if (argc != 2) return 2;
  ${kind === 'image-assembly-api' ? 'if (!LoadLibraryExW(L"psapi.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32)) return 8;' : ''}
  HMODULE module = LoadLibraryExW(argv[1], NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!module) { fprintf(stderr, "LoadLibraryExW: %lu", GetLastError()); return 3; }
  int (*value)(void) = (int (*)(void))GetProcAddress(module, "probe_value");
  if (!value) return 4;
  HMODULE (*library)(void) = (HMODULE (*)(void))GetProcAddress(module, "probe_library");
  if (!library) return 5;
  HMODULE dependency = library();
  if (!dependency) return 5;
  WCHAR file[32768];
  DWORD length = GetModuleFileNameW(dependency, file, sizeof(file) / sizeof(file[0]));
  if (!length || length >= sizeof(file) / sizeof(file[0])) return 5;
  char utf8[131072];
  int bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, file, length, utf8, sizeof(utf8), NULL, NULL);
  if (!bytes) return 6;
  printf("%d\\n", value());
  fwrite(utf8, 1, bytes, stdout);
  return FreeLibrary(module) ? 0 : 7;
}`);
      const compile = (manifest?: string) => execFileSync('cl.exe', ['/nologo', '/MT', source,
        '/Fo' + path.join(root, 'probe.obj'), '/link', '/INCREMENTAL:NO', '/OUT:' + executable,
        ...(manifest ? ['/MANIFEST:EMBED', '/MANIFESTINPUT:' + manifest] : ['/MANIFEST:NO'])],
      { cwd: root, timeout: 15_000 });
      const observe = (program = executable, image = entry) => {
        const [value, file] = execFileSync(program, [image], { encoding: 'utf8', timeout: 5_000, cwd: root }).split(/\r?\n/);
        return { value: Number(value), file: fs.realpathSync.native(file!).toLowerCase() };
      };
      compile();
      expect(parsePeLibraryMetadata(fs.readFileSync(executable)).manifests).toEqual([]);
      expect(observe()).toEqual({ value: 11, file: fs.realpathSync.native(library).toLowerCase() });
      const assemblyName = kind === 'assembly-resource' ? 'apack_value' : 'apack.fixture.value';
      const imageContext = kind === 'image-assembly' || kind === 'image-assembly-api';
      const selected = path.join(imageContext ? path.dirname(entry) : runtime,
        ...(kind === 'local' ? [] : [assemblyName]), kind === 'image-assembly-api' ? 'psapi.dll' : 'apack_value.dll');
      buildLibrary(selected, 22);
      // Merely placing a same-name DLL next to the executable must not change explicit loading.
      expect(observe()).toEqual({ value: 11, file: fs.realpathSync.native(library).toLowerCase() });
      let configured = executable;
      if (kind === 'local') {
        // Configure before first launch: Windows can retain an image's initial .local absence.
        configured = path.join(runtime, 'configured.exe');
        fs.copyFileSync(executable, configured);
        fs.writeFileSync(configured + '.local', '');
      } else {
        const identity = `<assemblyIdentity type="win32" name="${assemblyName}" version="1.0.0.0" processorArchitecture="amd64"/>`;
        const assemblyManifest = path.join(path.dirname(selected), assemblyName + '.manifest');
        fs.writeFileSync(assemblyManifest,
          `<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">${identity}<file name="${path.basename(selected)}"/></assembly>`);
        if (kind === 'assembly-resource') {
          buildLibrary(selected, 22, { manifest: assemblyManifest });
          fs.rmSync(assemblyManifest);
        }
        const manifest = path.join(root, 'probe.manifest');
        fs.writeFileSync(manifest,
          `<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity type="win32" name="apack.fixture.probe" version="1.0.0.0" processorArchitecture="amd64"/><dependency><dependentAssembly>${identity}</dependentAssembly></dependency></assembly>`);
        if (imageContext) {
          execFileSync('cl.exe', ['/nologo', '/MT', '/LD', bridge, '/Fo' + path.join(root, 'bridge.obj'), '/link',
            '/INCREMENTAL:NO', '/MANIFEST:EMBED,ID=2', '/MANIFESTUAC:NO', '/MANIFESTINPUT:' + manifest,
            '/OUT:' + entry, path.join(root, 'value.lib')], { cwd: root, timeout: 15_000 });
          expect(parsePeLibraryMetadata(fs.readFileSync(entry)).manifests.some(item => item.path[1] === 2)).toBe(true);
        } else {
          compile(manifest);
          expect(parsePeLibraryMetadata(fs.readFileSync(executable)).manifests.length).toBeGreaterThan(0);
        }
      }
      expect(observe(configured)).toEqual({ value: 22, file: fs.realpathSync.native(selected).toLowerCase() });
      fs.rmSync(dllMarker);
      const reads: string[] = [];
      const environment = capturePeLibraryEnvironment(configured);
      const check = (image = entry, view?: ReturnType<typeof createCompilerFileView>) => assertCapturedPeLibraries(image, path.dirname(library), {
        environment, executable: configured,
        moduleContext: (image, observe) => readPeActivationContext(image, { systemDirectory: environment.systemDirectory, application: configured, resource: 2, observe }), cwd: root,
        variables: process.env,
        loadedLibraries: kind === 'image-assembly-api' ? [path.join(environment.systemDirectory, 'psapi.dll')] : [], arch: process.arch,
        realpath: file => view ? view.fileSystem.realpath(file) : fs.realpathSync.native(file),
        directoryExists: file => view ? view.captureDataLocation(file, 'directory')?.kind === 'directory'
          : fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false,
        read: file => { reads.push(file); return view ? view.readDataBytes(file)
          : fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined; },
      });
      if (imageContext) {
        expect(() => check()).not.toThrow();
        expect(reads).toContain(selected);
        expect(reads).toContain(entry + '.2.config');
      } else expect(() => check()).toThrow(fs.realpathSync.native(selected));
      expect(fs.existsSync(dllMarker)).toBe(false);
      if (kind === 'image-assembly') {
        const context = (image: string) => readPeActivationContext(image, {
          systemDirectory: environment.systemDirectory, application: configured, resource: 2,
        });
        expect(context(entry).inputs).toContainEqual({ file: entry + '.2.config', kind: 'missing', hash: null });
        // Configure a fresh image before first load: Windows can retain its activation context.
        const configuredImage = path.join(path.dirname(entry), 'configured.dll');
        const configuration = configuredImage + '.2.config';
        const alternate = path.join(path.dirname(entry), 'alternate', assemblyName);
        fs.mkdirSync(path.dirname(alternate));
        // A renamed mapped file can retain its old section path; use independent captured files.
        fs.cpSync(path.dirname(selected), alternate, { recursive: true });
        fs.rmSync(path.dirname(selected), { recursive: true });
        fs.writeFileSync(configuration, `<?xml version="1.0"?><configuration><windows><assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1"><assemblyIdentity type="win32" name="apack.fixture.probe" version="1.0.0.0" processorArchitecture="amd64"/><probing privatePath="alternate"/></assemblyBinding></windows></configuration>`);
        fs.copyFileSync(entry, configuredImage);
        const relocated = path.join(alternate, path.basename(selected));
        // Establish real DLL configuration behavior before assessing metadata or admission.
        expect(observe(executable, configuredImage)).toEqual({ value: 22, file: fs.realpathSync.native(relocated).toLowerCase() });
        fs.rmSync(dllMarker);
        const after = context(configuredImage);
        expect(after.inputs).toContainEqual({ file: configuration, kind: 'file', hash: expect.any(String) });
        expect(after.redirections).toContainEqual({ name: 'apack_value.dll', file: relocated });
        reads.length = 0;
        expect(() => check(configuredImage)).not.toThrow();
        expect(reads).toContain(configuration);
        expect(reads).toContain(relocated);
        expect(fs.existsSync(dllMarker)).toBe(false);
        fs.appendFileSync(configuration, '<!-- changed -->');
        expect(context(configuredImage).inputs.find(input => input.file === configuration)?.hash)
          .not.toBe(after.inputs.find(input => input.file === configuration)?.hash);
        const observed: string[] = [];
        const view = createCompilerFileView(pack, { observe: file => { observed.push(file); } });
        try {
          check(configuredImage, view);
          expect(() => view.assertCurrent()).not.toThrow();
          const preferred = path.join(path.dirname(entry), assemblyName);
          expect(observed).toContain(path.join(preferred, assemblyName + '.manifest'));
          fs.mkdirSync(preferred);
          fs.copyFileSync(path.join(alternate, assemblyName + '.manifest'), path.join(preferred, assemblyName + '.manifest'));
          const preferredLibrary = path.join(preferred, path.basename(selected));
          buildLibrary(preferredLibrary, 33);
          // Use a fresh image for the next process, as a new compiler snapshot does.
          const nextImage = path.join(path.dirname(entry), 'next.dll');
          fs.copyFileSync(configuration, nextImage + '.2.config');
          fs.copyFileSync(configuredImage, nextImage);
          expect(observe(executable, nextImage)).toEqual({ value: 33, file: fs.realpathSync.native(preferredLibrary).toLowerCase() });
          fs.rmSync(dllMarker);
          expect(context(nextImage).redirections).toContainEqual({ name: 'apack_value.dll', file: preferredLibrary });
          expect(context(configuredImage).redirections).toContainEqual({ name: 'apack_value.dll', file: preferredLibrary });
          expect(() => view.assertCurrent()).toThrow(assemblyName);
          fs.rmSync(preferred, { recursive: true });
          expect(() => view.assertCurrent()).not.toThrow();
        } finally { view.dispose(); }
        const repair = path.join(path.dirname(entry), 'repair', assemblyName);
        fs.writeFileSync(configuration, fs.readFileSync(configuration, 'utf8').replace('privatePath="alternate"', 'privatePath="repair"'));
        const failedReads: string[] = [];
        const failed = createCompilerFileView(pack, { observe: file => { failedReads.push(file); } });
        try {
          expect(() => check(configuredImage, failed)).toThrow('Cannot inspect Windows activation context');
          const repairedManifest = path.join(repair, assemblyName + '.manifest');
          expect(failedReads).toContain(configuration);
          expect(failedReads).toContain(repairedManifest);
          expect(() => failed.assertCurrent()).not.toThrow();
          expect(fs.existsSync(dllMarker)).toBe(false);
          fs.mkdirSync(repair, { recursive: true });
          fs.copyFileSync(path.join(alternate, assemblyName + '.manifest'), repairedManifest);
          expect(() => failed.assertCurrent()).toThrow(assemblyName);
        } finally { failed.dispose(); }
      }
      if (kind === 'assembly') {
        const before = readCompilerRuntimeInputs(configured, false);
        const manifest = path.join(path.dirname(selected), 'apack.fixture.value.manifest');
        const original = fs.readFileSync(manifest);
        fs.appendFileSync(manifest, '<!-- changed -->');
        expect(readCompilerRuntimeInputs(configured, false).hash).not.toBe(before.hash);
        fs.writeFileSync(manifest, original);
        expect(readCompilerRuntimeInputs(configured, false).hash).toBe(before.hash);
        // Missing configuration and DLL candidates must participate in freshness too.
        fs.writeFileSync(configured + '.config', '<?xml version="1.0"?><configuration/>');
        expect(readCompilerRuntimeInputs(configured, false).hash).not.toBe(before.hash);
        fs.rmSync(configured + '.config');
        const alternate = path.join(runtime, 'alternate/apack.fixture.alternate/apack_value.dll');
        buildLibrary(alternate, 33);
        const alternateIdentity = '<assemblyIdentity type="win32" name="apack.fixture.alternate" version="1.0.0.0" processorArchitecture="amd64"/>';
        fs.writeFileSync(path.join(path.dirname(alternate), 'apack.fixture.alternate.manifest'),
          `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">${alternateIdentity}<file name="apack_value.dll"/></assembly>`);
        const applicationManifest = path.join(root, 'alternate-probe.manifest');
        fs.writeFileSync(applicationManifest, `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity type="win32" name="apack.fixture.probe" version="1.0.0.0" processorArchitecture="amd64"/><dependency><dependentAssembly>${alternateIdentity}</dependentAssembly></dependency></assembly>`);
        const originalExecutable = fs.readFileSync(configured);
        compile(applicationManifest);
        fs.writeFileSync(configured + '.config', `<?xml version="1.0"?><configuration><windows><assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1"><assemblyIdentity type="win32" name="apack.fixture.probe" version="1.0.0.0" processorArchitecture="amd64"/><probing privatePath="alternate"/></assemblyBinding></windows></configuration>`);
        expect(observe(configured)).toEqual({ value: 33, file: fs.realpathSync.native(alternate).toLowerCase() });
        expect(capturePeLibraryEnvironment(configured).applicationContext.redirections).toContainEqual({ name: 'apack_value.dll', file: alternate });
        expect(readCompilerRuntimeInputs(configured, false).hash).not.toBe(before.hash);
        fs.rmSync(dllMarker);
        const policyRoot = path.join(root, 'copied-policy');
        const policyExecutable = copyPeRuntimeFixture(configured, policyRoot);
        expect(fs.existsSync(dllMarker)).toBe(false);
        expect(observe(policyExecutable)).toEqual({ value: 33,
          file: fs.realpathSync.native(path.join(policyRoot, path.relative(runtime, alternate))).toLowerCase() });
        fs.rmSync(configured + '.config');
        fs.writeFileSync(configured, originalExecutable);
        expect(readCompilerRuntimeInputs(configured, false).hash).toBe(before.hash);
        const value = fs.readFileSync(selected);
        fs.rmSync(selected);
        const missing = readCompilerRuntimeInputs(configured, false).hash;
        expect(missing).not.toBe(before.hash);
        fs.writeFileSync(selected, value);
        expect(readCompilerRuntimeInputs(configured, false).hash).toBe(before.hash);
        const copiedRoot = path.join(root, 'copied');
        const copiedExecutable = copyPeRuntimeFixture(configured, copiedRoot);
        expect(observe(copiedExecutable)).toEqual({ value: 22,
          file: fs.realpathSync.native(path.join(copiedRoot, path.relative(runtime, selected))).toLowerCase() });
      }
      completed = true;
    } finally {
      if (completed) fs.rmSync(root, { recursive: true, force: true });
      else console.error(`Retained PE ${kind} control: ${root}`);
    }
  },
);

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

it.runIf(process.platform === 'win32').each(['preload', 'thread', 'preload-and-thread', 'preload-and-module'] as const)(
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
        ...(site !== 'preload' ? { content: { formats: { rows: { compiler: site === 'preload-and-module' ? 'src/compiler.cjs' : 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
          sources: { rows: { path: 'src/value.txt', format: 'rows' } } } } : {}) },
        files: { 'src/value.txt': 'input', 'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true } }) } });
      const { library, addon, dllMarker, addonMarker } = createPeNativeFixture(root, pack);
      const ordinaryLoad = `const addon = require(${JSON.stringify(addon)}); const result = {value:addon.read(),library:addon.libraryPath()};`;
      const ordinaryScript = site === 'preload-and-thread'
        ? `${ordinaryLoad} new (require('node:worker_threads').Worker)(${JSON.stringify(ordinaryLoad + " require('node:worker_threads').parentPort.postMessage(result);")}, {eval:true})
            .once('message', worker => console.log(JSON.stringify({...result, worker})));`
        : site === 'preload-and-module'
          ? ordinaryLoad + ` const compiler = require(${JSON.stringify(addon)}); console.log(JSON.stringify({...result,compiler:{value:compiler.read(),library:compiler.libraryPath()}}));`
          : ordinaryLoad + ' console.log(JSON.stringify(result));';
      const ordinary = () => JSON.parse(execFileSync(process.execPath, ['-e',
        ordinaryScript], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, NODE_OPTIONS: previousOptions } })) as {
        value: number; library: string; worker?: { value: number; library: string }; compiler?: { value: number; library: string };
      };
      const baseline = ordinary();
      expect(baseline.value).toBe(11);
      expect(fs.realpathSync.native(baseline.library).toLowerCase()).toBe(fs.realpathSync.native(library).toLowerCase());
      if (site === 'preload-and-thread') {
        expect(baseline.worker?.value).toBe(11);
        expect(fs.realpathSync.native(baseline.worker!.library).toLowerCase()).toBe(fs.realpathSync.native(library).toLowerCase());
      }
      if (site === 'preload-and-module') expect(baseline.compiler).toEqual({value:11,library:baseline.library});
      checkpoint('ordinary loader control');
      fs.rmSync(dllMarker); fs.rmSync(addonMarker);
      const proof = path.join(root, 'loaded.jsonl');
      const load = (phase: 'startup' | 'compiler') => `const nativeModulePath = ${JSON.stringify(addon)};
const addon = require(nativeModulePath);
const {threadId} = require('node:worker_threads');
require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({phase:${JSON.stringify(phase)},thread:threadId,value:addon.read(),library:addon.libraryPath(),workspace:process.env[${JSON.stringify(BUILD_INPUTS_DIRECTORY_ENV)}]}) + '\\n');`;
      if (site !== 'thread') {
        const preload = path.join(root, 'preload.cjs');
        fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.startup')]) { ${load('startup')} }`);
        process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previousOptions), '--require', preload]);
      }
      if (site === 'preload-and-module') {
        fs.writeFileSync(path.join(pack, 'src/compiler.cjs'), `module.exports = () => {
  ${load('compiler')}
  return [{entity:'Relation',name:'NATIVE'}];
};`);
      } else if (site !== 'preload') {
        fs.writeFileSync(path.join(pack, 'src/compiler.ts'), `import { Worker } from 'node:worker_threads';
export default () => new Promise((resolve, reject) => {
  const worker = new Worker(${JSON.stringify(`if (!globalThis[Symbol.for('apack.compiler.startup')]) throw new Error('Native thread has no input owner');
${load('compiler')}
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
        phase: 'startup' | 'compiler'; thread: number; value: number; library: string; workspace: string;
      }[];
      expect(results.length).toBeGreaterThan(0);
      if (site === 'preload-and-thread') {
        expect(results.some(result => result.thread === 0)).toBe(true);
        expect(results.some(result => result.thread > 0)).toBe(true);
      }
      if (site === 'preload-and-module') {
        expect(results.some(result => result.phase === 'startup')).toBe(true);
        expect(results.some(result => result.phase === 'compiler' && result.thread === 0)).toBe(true);
        expect(new Set(results.map(result => result.library.toLowerCase())).size).toBe(1);
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
      if (site === 'preload-and-module') expect(escaped.compiler).toEqual({value:11,library:escaped.library});
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
