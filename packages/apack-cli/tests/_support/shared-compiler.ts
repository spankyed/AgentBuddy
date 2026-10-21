import { afterAll } from 'vitest';
import type { CaptureCompiler } from '../../src/build/build-process.ts';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from '../../src/build/compiler-installation.ts';

/**
 * One compiler installation for the cases of a spec file that opt in, where capturing one is setup rather than
 * the subject. Capture copies and verifies the CLI's whole compiler graph, so a file whose cases each capture
 * their own pays that once per case for nothing the case asserts.
 *
 * Call it once at the top of the file. It disposes what it captured after the file's last case, and every
 * installation it lends has a `dispose` that leaves it in place, so a case's own cleanup — `builder.close()`,
 * `compiler.dispose()` — stays correct unchanged. A builder still checks `isCurrent` before each reuse, and a
 * lent installation that stops being current is replaced by a fresh capture.
 *
 * **Opt in only where capture is incidental.** A case whose subject is capture itself, the captured runtime,
 * an `ESBUILD_BINARY_PATH` override, a changing compiler graph or the removal of an installation keeps a fresh
 * one: sharing would leave the thing it asserts unexercised.
 */
export function shareCompilerInstallation(): { capture: CaptureCompiler; installation(options?: { cwd?: string }): Promise<CompilerInstallation> } {
  const captured: CompilerInstallation[] = [];
  let latest: Promise<CompilerInstallation> | undefined;
  afterAll(async () => { await Promise.all(captured.splice(0).map(installation => installation.dispose())); });
  const capture: CaptureCompiler = async (directory = compilerPackageDirectory(), options = {}) => {
    const previous = latest;
    latest = (async () => {
      const current = await previous?.catch(() => undefined);
      if (current?.isCurrent(directory, options)) return current;
      const installation = await captureCompilerInstallation(directory, options);
      captured.push(installation);
      return installation;
    })();
    const shared = await latest;
    return { ...shared, dispose: async () => {} };
  };
  return { capture, installation: ({ cwd } = {}) => capture(compilerPackageDirectory(), { cwd }) };
}
