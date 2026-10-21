import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import * as installation from '../../src/build/compiler-installation.ts';
import * as runtime from '../../src/build/compiler-runtime.ts';

/** A pack whose compiler, runtime and esbuild override are fixture files, so their watch subscriptions can be observed */
export function compilerWatchFixture(roots: string[]) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-watch-')));
  roots.push(root);
  const pack = path.join(root, 'pack');
  fs.mkdirSync(path.join(pack, 'src'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'src/index.ts'), "export type { Contract } from 'outside';");
  fs.writeFileSync(path.join(pack, 'tsconfig.json'), JSON.stringify({ extends: '../base.json' }));
  const configure = (target = 'contract.d.ts') => fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({
    compilerOptions: { noLib: true, types: [], baseUrl: '.', paths: { outside: [target] },
      module: 'ESNext', moduleResolution: 'Bundler' },
  }));
  configure();
  fs.writeFileSync(path.join(root, 'contract.d.ts'), 'export type Contract = string;');
  const physicalRoot = fs.realpathSync(root);
  const compiler = path.join(physicalRoot, 'compiler');
  fs.mkdirSync(compiler);
  fs.writeFileSync(path.join(compiler, 'package.json'), '{"name":"fixture-compiler"}');
  const entry = path.join(compiler, 'index.js');
  fs.writeFileSync(entry, 'first compiler');
  const executable = path.join(physicalRoot, 'runtime');
  fs.writeFileSync(executable, 'first runtime', { mode: 0o755 });
  const override = path.join(physicalRoot, 'esbuild');
  vi.spyOn(installation, 'compilerPackageDirectory').mockReturnValue(compiler);
  const readRuntime = runtime.readCompilerRuntimeInputs;
  vi.spyOn(runtime, 'readCompilerRuntimeInputs').mockImplementation((_executable, _electron, onFile, observe) =>
    readRuntime(executable, false, onFile, observe));
  vi.stubEnv('ESBUILD_BINARY_PATH', path.relative(pack, override));
  return { root, pack, configure, compiler, entry, executable, override };
}
