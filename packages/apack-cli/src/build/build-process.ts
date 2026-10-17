import { COMPILER_INPUTS_ENV } from './compiler-installation-inputs.ts';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { COMPILER_PROCESS_GROUP_ENV, stopCompilerProcessGroup } from './compiler-process-group.ts';
import { checkoutFor, ensureCheckoutPackages } from './checkout-packages.ts';
import { captureCompilerInstallation, compilerPackageDirectory, type CompilerInstallation } from './compiler-installation.ts';
import { cliPackageDirectory } from './tool-identity.ts';
import { compilationConditions } from './compilation-inputs.ts';
import { compilerStartupOptions, COMPILER_NODE_OPTIONS_ENV } from './compiler-startup-options.ts';
import { BUILD_INPUTS_IPC_ENV, readBuildWatchInputs, type BuildWatchInputs } from './build-watch-inputs.ts';
import { holdPackBuildLock } from './build-lock.ts';
import { readValidManifest } from '../utils.ts';
import { buildStagingDir, publishPackBuild, readPackBuildCandidate, type PackBuildCandidate } from './build-publication.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, removeCompilerReadTree } from './compiler-read-tree.ts';
import { startPackFrontend, type PackFrontend, type PackFrontendAddress } from './frontend-process.ts';
import { findFEEntry, readPackDevServerInputs } from './fe-bundler.ts';

// Give worker SIGTERM handlers a short cleanup phase before forced termination.
const STOP_GRACE_MS = 2_000;

export interface PackBuildOptions {
  readonly args?: readonly string[];
  readonly onInputs?: (inputs: BuildWatchInputs) => void | Promise<void>;
  readonly signal?: AbortSignal;
}

export interface PackBuilder {
  build(options?: PackBuildOptions): Promise<void>;
  serveFrontend(changed: (address: PackFrontendAddress | undefined) => void): Promise<PackFrontendAddress | undefined>;
  close(): Promise<void>;
}

/** One pack owns its compiler copy; every build gets a fresh process and live input checks. */
export function createPackBuilder(root: string): PackBuilder {
  interface Generation { compiler: CompilerInstallation; frontend?: PackFrontend; configuration?: string }
  let current: Generation | undefined;
  const owned = new Set<Generation>();
  let frontendChanged: ((address: PackFrontendAddress | undefined) => void) | undefined;
  let active = Promise.resolve();
  let stopping: Promise<void> | undefined;
  const stopped = new AbortController();
  const dispose = async (generation: Generation) => {
    await generation.frontend?.close();
    await generation.compiler.dispose();
    owned.delete(generation);
  };
  const frontend = async (generation: Generation, signal: AbortSignal) => {
    const entry = findFEEntry(root);
    const configuration = readPackDevServerInputs(root);
    if (!entry) {
      await generation.frontend?.close();
      generation.frontend = undefined;
    } else if (!generation.frontend?.alive()) {
      await generation.frontend?.close();
      generation.frontend = await startPackFrontend(root, generation.compiler, signal);
      if (readPackDevServerInputs(root) !== configuration) {
        await generation.frontend.close();
        generation.frontend = undefined;
        throw new Error('Pack frontend configuration changed during startup; build the pack again');
      }
      generation.configuration = configuration;
    } else if (generation.configuration !== configuration) {
      throw new Error('Pack frontend configuration changed; build the pack before serving it again');
    }
    return generation.frontend?.address;
  };
  return {
    build({ args = [], onInputs, signal }: PackBuildOptions = {}) {
      if (stopped.signal.aborted) return Promise.reject(new Error('Pack builder is closed'));
      const options = { args: [...args], onInputs, signal: signal ? AbortSignal.any([signal, stopped.signal]) : stopped.signal };
      const result = active.then(async () => {
        options.signal.throwIfAborted();
        ensureCheckoutPackages(root);
        const cli = cliPackageDirectory();
        if (checkoutFor(cli) !== checkoutFor(root)) ensureCheckoutPackages(cli);
        const directory = compilerPackageDirectory();
        const configuration = frontendChanged ? readPackDevServerInputs(root) : undefined;
        const reusable = current?.compiler.isCurrent(directory, { cwd: root })
          && (!current.frontend || current.configuration === configuration);
        const candidate: Generation = reusable ? current!
          : { compiler: await captureCompilerInstallation(directory, { cwd: root }) };
        owned.add(candidate);
        try {
          options.signal.throwIfAborted();
          // A replacement must be ready before its backend can replace the accepted build.
          if (frontendChanged && candidate !== current && current?.frontend) await frontend(candidate, options.signal);
          const lock = await holdPackBuildLock(root, {
            packId: readValidManifest(root).id, what: ['apack pack build', ...args].join(' '), signal: options.signal,
            onWait: holder => console.log(`Waiting for ${holder} to finish...`),
          });
          try { await buildWithCompiler(root, candidate.compiler, options); }
          finally { lock.release(); }
          if (frontendChanged) {
            const before = current?.frontend?.address;
            const address = await frontend(candidate, options.signal);
            if (address !== before) frontendChanged(address);
          }
          const previous = current;
          current = candidate;
          if (previous && previous !== candidate) await dispose(previous);
        } catch (error) {
          if (candidate !== current) await dispose(candidate);
          throw error;
        }
      });
      active = result.catch(() => {});
      return result;
    },
    serveFrontend(changed) {
      if (stopped.signal.aborted) return Promise.reject(new Error('Pack builder is closed'));
      const result = active.then(async () => {
        stopped.signal.throwIfAborted();
        if (!current) throw new Error('Build the pack before starting its frontend');
        const address = await frontend(current, stopped.signal);
        changed(address);
        frontendChanged = changed;
        return address;
      });
      active = result.then(() => {}, () => {});
      return result;
    },
    close() {
      if (!stopping) {
        stopped.abort();
        stopping = active.then(async () => { await Promise.all([...owned].map(dispose)); current = undefined; });
      }
      return stopping;
    },
  };
}

export async function runPackBuild(root: string, options: PackBuildOptions = {}): Promise<void> {
  const builder = createPackBuilder(root);
  try { await builder.build(options); }
  finally { await builder.close(); }
}

async function buildWithCompiler(root: string, compiler: CompilerInstallation, { args = [], onInputs, signal }: PackBuildOptions): Promise<void> {
  const inputsDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-inputs-')));
  try {
    const candidate = await new Promise<PackBuildCandidate>((resolve, reject) => {
      let processError: Error | undefined;
      let observationError: Error | undefined;
      let candidate: PackBuildCandidate | undefined;
      let observing = Promise.resolve();
      let stopping: Promise<void> | undefined;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const grouped = process.platform !== 'win32';
      const nodeOptions = compilerStartupOptions(compiler.bin, process.env.NODE_OPTIONS);
      const child = spawn(process.execPath, [
        ...compilationConditions().map(condition => `--conditions=${condition}`),
        compiler.bin, 'pack', 'build', ...args,
      ], {
        cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], signal, detached: grouped,
        // Transform with this captured compiler, rather than reuse another installation's tsx cache.
        env: { ...process.env, ...compiler.environment, APACK_FRONTEND_WORKER: undefined, [COMPILER_PROCESS_GROUP_ENV]: grouped ? '1' : undefined, TSX_DISABLE_CACHE: '1', APACK_BUILD_WORKER: '1', [COMPILER_INPUTS_ENV]: compiler.inputsFile,
          [BUILD_INPUTS_DIRECTORY_ENV]: inputsDirectory,
          [BUILD_INPUTS_IPC_ENV]: onInputs ? '1' : '0', [COMPILER_NODE_OPTIONS_ENV]: nodeOptions.user,
          NODE_OPTIONS: nodeOptions.worker, ELECTRON_RUN_AS_NODE: '1' },
      });
      const stop = () => {
        if (stopping) return;
        stopping = grouped && child.pid ? stopCompilerProcessGroup(child.pid)
          : Promise.resolve().then(() => { child.kill('SIGKILL'); });
        // close awaits this result; observe rejection even if inherited pipes delay close.
        void stopping.catch(() => {});
      };
      const abort = () => { escalation = setTimeout(stop, STOP_GRACE_MS); };
      const clearStop = () => { clearTimeout(escalation); signal?.removeEventListener('abort', abort); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.on('message', message => {
        try {
          const reported = readPackBuildCandidate(message);
          if (reported) {
            if (candidate) throw new Error('Build worker reported more than one candidate');
            candidate = reported;
          }
        } catch (error) { observationError ??= error instanceof Error ? error : new Error(String(error)); }
        const inputs = readBuildWatchInputs(message);
        if (inputs && onInputs) {
          observing = observing.then(() => onInputs(inputs)).catch(error => {
            observationError ??= error instanceof Error ? error : new Error(String(error));
          });
        }
      });
      child.once('error', error => { processError = error; });
      child.once('exit', () => { clearStop(); if (grouped) stop(); });
      child.once('close', async (code, exitSignal) => {
        clearStop();
        try { await stopping; } catch (error) { reject(error); return; }
        await observing;
        if (processError || observationError) reject(processError ?? observationError);
        else if (code === 0 && candidate) resolve(candidate);
        else if (code === 0) reject(new Error('Build worker exited without a completed candidate'));
        else reject(new Error(`Pack build process ${exitSignal ? `terminated with ${exitSignal}` : `exited with code ${code}`}`));
      });
    });
    signal?.throwIfAborted();
    publishPackBuild(root, candidate);
  } finally {
    fs.rmSync(buildStagingDir(root), { recursive: true, force: true });
    removeCompilerReadTree(inputsDirectory);
  }
}
