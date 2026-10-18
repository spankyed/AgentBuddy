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

it.runIf(process.platform === 'linux')('owns retained ELF libraries, preserves Vue updates and refuses absolute outside dependencies', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-elf-libraries-')));
  const pack = path.join(root, 'pack');
  const previous = process.env.NODE_OPTIONS;
  let compiler: CompilerInstallation | undefined;
  let frontend: PackFrontend | undefined;
  let refused: PackFrontend | undefined;
  const signal = new AbortController().signal;
  const compile = (args: string[]) => execFileSync('cc', args, { timeout: 15_000 });
  try {
    packFixture({ at: pack, nodeModules: path.join(REPO_ROOT, 'node_modules'), manifest: { features: {} },
      files: { 'src/pack-entry-fe.ts': "export { default } from './View.vue';", 'src/View.vue': '<template>ELF_BEFORE</template>' } });
    const library = path.join(pack, 'lib/libvalue.so');
    const addon = path.join(pack, 'binding/addon.node');
    const marker = path.join(root, 'initialized');
    const reference = '$ORIGIN/../lib/libvalue.so';
    const buildLibrary = (file: string, value: number, name: string) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.c', `int native_value(void) { return ${value}; }`);
      compile(['-fPIC', '-shared', file + '.c', '-Wl,-soname,' + name, '-o', file]);
    };
    const source = path.join(root, 'addon.c');
    fs.writeFileSync(source, nativeAddonSource(marker));
    const buildAddon = (file: string, dependency: string) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      compile(['-fPIC', '-shared', '-I', path.resolve(path.dirname(process.execPath), '../include/node'), source, dependency, '-o', file]);
    };
    const observe = () => JSON.parse(execFileSync(process.execPath, ['-e',
      `const addon = require(${JSON.stringify(addon)}); console.log(JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects.map(file => require('node:path').normalize(file)) }));`],
    { encoding: 'utf8', timeout: 10_000 })) as { value: number; libraries: string[] };
    buildLibrary(library, 11, reference);
    buildAddon(addon, library);
    const ordinary = observe();
    expect(ordinary.value).toBe(11);
    expect(ordinary.libraries).toContain(library);
    fs.rmSync(marker);
    const proof = path.join(root, 'loaded.json');
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(preload, `if (globalThis[Symbol.for('apack.compiler.frontend')] && require('node:worker_threads').isMainThread) {
      const addon = require(${JSON.stringify(addon)});
      require('node:fs').writeFileSync(${JSON.stringify(proof)}, JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects.map(file => require('node:path').normalize(file)) }));
    }`);
    compiler = await captureCompilerInstallation(compilerPackageDirectory(), { cwd: pack });
    process.env.NODE_OPTIONS = formatNodeOptions([...parseNodeOptions(previous), '--require', preload]);
    frontend = await startPackFrontend(pack, compiler, signal);
    const loaded = JSON.parse(fs.readFileSync(proof, 'utf8')) as { value: number; libraries: string[] };
    expect(loaded.value).toBe(11);
    expect(loaded.libraries).not.toContain(library);
    expect(loaded.libraries.some(file => file.includes('apack-vite-') && file.endsWith('/lib/libvalue.so'))).toBe(true);
    expect(await frontend.isCurrent(signal)).toBe(true);
    const original = fs.readFileSync(library);
    const originalMode = fs.statSync(library).mode & 0o777;
    const replacement = path.join(root, 'replacement.so');
    buildLibrary(replacement, 22, reference);
    fs.renameSync(replacement, library);
    expect(await frontend.isCurrent(signal)).toBe(false);
    fs.writeFileSync(replacement, original, { mode: originalMode });
    fs.renameSync(replacement, library);
    expect(await frontend.isCurrent(signal)).toBe(true);
    const view = `http://localhost:${frontend.address.port}/src/View.vue`;
    expect(await (await fetch(view)).text()).toContain('ELF_BEFORE');
    fs.writeFileSync(path.join(pack, 'src/View.vue'), '<template>ELF_AFTER</template>');
    await vi.waitFor(async () => expect(await (await fetch(view)).text()).toContain('ELF_AFTER'), { timeout: 2_000 });
    expect(await frontend.isCurrent(signal)).toBe(true);
    const outside = path.join(root, 'outside/liboutside.so');
    buildLibrary(outside, 22, outside);
    const candidate = path.join(root, 'candidate.node');
    buildAddon(candidate, outside);
    fs.renameSync(candidate, addon);
    const escaped = observe();
    expect(escaped.value).toBe(22);
    expect(escaped.libraries).toContain(outside);
    fs.rmSync(marker);
    await expect(startPackFrontend(pack, compiler, signal).then(value => { refused = value; })).rejects.toThrow();
    expect(fs.existsSync(marker)).toBe(false);
    expect(frontend.alive()).toBe(true);
    expect(await (await fetch(view)).text()).toContain('ELF_AFTER');
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
    try { await refused?.close(); await frontend?.close(); }
    finally { await compiler?.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  }
});
