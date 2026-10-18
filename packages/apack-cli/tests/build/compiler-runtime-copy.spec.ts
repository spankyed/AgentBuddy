import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { captureCompilerInstallation } from '../../src/build/compiler-installation.ts';

const runtime = vi.hoisted(() => ({ executable: '' }));
vi.mock('../../src/build/compiler-runtime.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/build/compiler-runtime.ts')>();
  return { ...original, readCompilerRuntimeInputs(executable = process.execPath, _electron?: boolean, onFile?: Parameters<typeof original.readCompilerRuntimeInputs>[2]) {
    return original.readCompilerRuntimeInputs(executable === process.execPath ? runtime.executable : executable, true, onFile);
  } };
});

// Inert runtime bytes exercise the real copier without launching a copied executable.
it.skipIf(process.platform !== 'darwin')('preserves signed framework link text and invalidates changed link spelling', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-runtime-copy-')));
  let installation: Awaited<ReturnType<typeof captureCompilerInstallation>> | undefined;
  try {
    const compiler = path.join(root, 'compiler');
    fs.mkdirSync(path.join(compiler, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(compiler, 'package.json'), '{"name":"compiler","version":"1.0.0"}');
    fs.writeFileSync(path.join(compiler, 'bin/apack.mjs'), '');
    runtime.executable = path.join(root, 'Runtime.app/Contents/MacOS/runtime');
    fs.mkdirSync(path.dirname(runtime.executable), { recursive: true });
    fs.writeFileSync(runtime.executable, 'INERT', { mode: 0o755 });
    const framework = path.join(root, 'Runtime.app/Contents/Frameworks/Runtime.framework');
    fs.mkdirSync(path.join(framework, 'Versions/A'), { recursive: true });
    fs.writeFileSync(path.join(framework, 'Versions/A/runtime'), 'LIBRARY');
    fs.symlinkSync('A', path.join(framework, 'Versions/Current'));
    fs.symlinkSync('Versions/Current/runtime', path.join(framework, 'runtime'));
    installation = await captureCompilerInstallation(compiler);
    const captured = path.join(installation.runtimeDirectory, 'Frameworks/Runtime.framework/runtime');
    expect(fs.readlinkSync(captured)).toBe('Versions/Current/runtime');
    expect(fs.readFileSync(captured, 'utf8')).toBe('LIBRARY');
    expect(installation.isCurrent(compiler)).toBe(true);
    fs.unlinkSync(path.join(framework, 'runtime'));
    fs.symlinkSync('./Versions/Current/runtime', path.join(framework, 'runtime'));
    expect(installation.isCurrent(compiler)).toBe(false);
  } finally {
    await installation?.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
