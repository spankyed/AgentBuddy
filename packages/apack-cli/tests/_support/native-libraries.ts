import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeAddonSource } from './native-addon.ts';

// The fixtures the native-library proofs share: a pack beside a compiled addon whose library is placed by `mode`,
// and the loads that run it inside and outside a captured compiler.
export function nativeFixture(mode: 'relative' | 'absolute' | 'transitive' | 'fallback' | 'framework' | 'runpath', sdk?: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-libraries-')));
  try {
    const pack = path.join(root, 'pack');
    const native = path.join(root, 'native-package');
    const macho = process.platform === 'darwin';
    const library = path.join(native, mode === 'framework' ? 'Value.framework/Versions/A/Value' : `lib/libvalue.${macho ? 'dylib' : 'so'}`);
    fs.mkdirSync(pack);
    fs.mkdirSync(path.dirname(library), { recursive: true });
    fs.mkdirSync(path.join(native, 'binding'));
    fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: 'native-fixture', version: '1.0.0', main: 'binding/addon.node' }));
    const marker = path.join(root, 'initialized');
    const outside = path.join(root, `outside/liboutside.${macho ? 'dylib' : 'so'}`);
    const architecture = macho ? ['-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64'] : ['-fPIC'];
    function buildLibrary(file: string, source: string, installName: string, dependencies: string[] = []) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const input = file + '.c';
      fs.writeFileSync(input, source);
      execFileSync(macho ? 'clang' : 'cc', [...architecture, macho ? '-dynamiclib' : '-shared', input, ...dependencies,
        (macho ? '-Wl,-install_name,' : '-Wl,-soname,') + installName, '-o', file]);
    }
    if (mode === 'transitive') buildLibrary(outside, 'int outside_value(void) { return 11; }', outside);
    buildLibrary(library, mode === 'transitive'
      ? 'extern int outside_value(void); int native_value(void) { return outside_value(); }'
      : 'int native_value(void) { return 11; }',
    mode === 'absolute' ? library : mode === 'fallback' || mode === 'runpath' ? path.basename(library)
      : (macho ? '@loader_path/../' : '$ORIGIN/../') + path.relative(native, library), mode === 'transitive' ? [outside] : []);
    const addonSource = path.join(native, 'binding/addon.c');
    fs.writeFileSync(addonSource, nativeAddonSource(marker));
    execFileSync(macho ? 'clang' : 'cc', [...architecture, ...(macho ? ['-bundle', '-undefined', 'dynamic_lookup'] : ['-shared']),
      '-I', path.resolve(path.dirname(process.execPath), '../include/node'), addonSource, library,
      ...(mode === 'runpath' ? ['-Wl,-rpath,$ORIGIN/../lib'] : []),
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

export function ordinaryNativeLoad(fixture: ReturnType<typeof nativeFixture>, env: NodeJS.ProcessEnv) {
  return JSON.parse(execFileSync(process.execPath, ['-e', `const addon = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))});
console.log(JSON.stringify({ value: addon.read(), libraries: process.report.getReport().sharedObjects.map(file => require('node:path').normalize(file)) }));`], {
    encoding: 'utf8', env, timeout: 10_000,
  })) as { value: number; libraries: string[] };
}

export function nativeLoad(fixture: ReturnType<typeof nativeFixture>, proof: string) {
  return `const addon = require(${JSON.stringify(path.join(fixture.native, 'binding/addon.node'))});
require('node:fs').appendFileSync(${JSON.stringify(proof)}, JSON.stringify({ thread: require('node:worker_threads').threadId, value: addon.read(), libraries: process.report.getReport().sharedObjects }) + '\\n');`;
}

export function nativeWorkerCompiler(load: string) {
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
