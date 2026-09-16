import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withModuleBridge } from '../../src/packs/module-bridge.ts';

let root: string;
let runtimeDir: string;
let resolveFrom: string;
let caseCount = 0;
let name: (base: string) => string;

/** Installs a CommonJS package under the root's node_modules; returns its entry's path */
function installPackage(pkg: string, source: string): string {
  const dir = path.join(root, 'node_modules', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' }));
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  return fs.realpathSync(path.join(dir, 'index.js'));
}

/** A runtime file outside the root, so it resolves no package on its own */
function writeRuntime(source: string): string {
  const file = path.join(runtimeDir, `runtime-${caseCount}.cjs`);
  fs.writeFileSync(file, source);
  return file;
}

beforeEach(() => {
  caseCount++;
  // Module cache entries are process-wide: each case uses its own package names
  name = (base) => `${base}-bridge-case-${caseCount}`;
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'module-bridge-')));
  runtimeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'module-bridge-runtime-')));
  resolveFrom = path.join(root, 'entry.cjs');
  fs.writeFileSync(resolveFrom, '');
});

afterEach(() => {
  const require = createRequire(import.meta.url);
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`-bridge-case-${caseCount}`) || key.startsWith(root) || key.startsWith(runtimeDir)) delete require.cache[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

describe('withModuleBridge', () => {
  it('gives the loaded code the bridged module for a specifier', () => {
    const lib = name('lib');
    const bridged = { value: 'bridged' };
    const runtime = writeRuntime(`module.exports = require('${lib}');`);

    const loaded = withModuleBridge({ modules: { [lib]: bridged }, resolveFrom }, () => createRequire(runtime)(runtime));

    expect(loaded).toBe(bridged);
  });

  it("points the specifier's real path, resolved from resolveFrom, at the bridged module", () => {
    const lib = name('lib');
    const realPath = installPackage(lib, `module.exports = { value: 'real copy' };`);
    const bridged = { value: 'bridged' };

    withModuleBridge({ modules: { [lib]: bridged }, resolveFrom }, () => undefined);

    // A lazy require after the bridge is gone, from where the runtime resolves packages, gets the bridged module
    expect(createRequire(resolveFrom)(lib)).toBe(bridged);
    expect(createRequire(resolveFrom).cache[realPath]?.exports).toBe(bridged);
  });

  it('keeps a real path already loaded, and a bridged module already cached', () => {
    const lib = name('lib');
    installPackage(lib, `module.exports = { value: 'real copy' };`);
    const alreadyLoaded = createRequire(resolveFrom)(lib) as { value: string };
    const first = { value: 'first bridge' };
    const runtime = writeRuntime(`module.exports = require('${lib}');`);

    withModuleBridge({ modules: { [lib]: first }, resolveFrom }, () => undefined);
    const loaded = withModuleBridge({ modules: { [lib]: { value: 'second bridge' } }, resolveFrom }, () => createRequire(runtime)(runtime));

    expect(createRequire(resolveFrom)(lib)).toBe(alreadyLoaded);
    expect(loaded).toBe(first);
  });

  it("loads a package that can't be resolved as a module that throws on use, with stubMissing", () => {
    const missing = name('not-installed');
    const runtime = writeRuntime(`module.exports = require('${missing}');`);

    const loaded = withModuleBridge({ modules: {}, resolveFrom, stubMissing: true }, () => createRequire(runtime)(runtime)) as { run(): void };

    expect(() => loaded.run()).toThrow(`"${missing}" isn't installed (read run)`);
    expect(() => (loaded as unknown as () => void)()).toThrow(`"${missing}" isn't installed (called)`);
  });

  it("still throws for a missing package without stubMissing, and for a missing relative file", () => {
    const missing = name('not-installed');
    const bare = writeRuntime(`module.exports = require('${missing}');`);
    expect(() => withModuleBridge({ modules: {}, resolveFrom }, () => createRequire(bare)(bare))).toThrow(/Cannot find module/);

    const relative = path.join(runtimeDir, 'relative.cjs');
    fs.writeFileSync(relative, `module.exports = require('./${missing}');`);
    expect(() => withModuleBridge({ modules: {}, resolveFrom, stubMissing: true }, () => createRequire(relative)(relative))).toThrow(/Cannot find module/);
  });
});
